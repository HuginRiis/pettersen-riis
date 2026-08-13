import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen,
  Search,
  Loader2,
  Save,
  Trash2,
  ExternalLink,
  FileText,
  Upload,
  Link2,
  X,
  Pencil,
} from "lucide-react";
import { PageShell, PageHero } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getStoredWho } from "@/lib/push-client";
import {
  listManuals,
  searchManuals,
  saveManualFromUrl,
  saveManualUpload,
  deleteManual,
  updateManual,
  getManualFileUrl,
  type ManualRow,
  type ManualCandidate,
} from "@/lib/manuals.functions";
import heroImg from "@/assets/got-bruksanvisning.jpg";

export const Route = createFileRoute("/bruksanvisning")({
  head: () => ({
    meta: [
      { title: "Bruksanvisning — Husets manualer som PDF | House Pettersen Riis" },
      {
        name: "description",
        content:
          "Søk opp bruksanvisninger på nett, lagre dem som PDF i borgens arkiv og finn dem igjen på sekundet.",
      },
      { property: "og:title", content: "Bruksanvisning — House Pettersen Riis" },
      {
        property: "og:description",
        content: "Alle husets bruksanvisninger samlet, søkbare og lagret som PDF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BruksanvisningPage,
});

const CATEGORIES = [
  "Kjøkken",
  "Hvitevarer",
  "Smarthus",
  "Verktøy",
  "Hage",
  "Elektronikk",
  "Bil",
  "Annet",
] as const;

const fmtSize = (n: number | null) =>
  n == null ? "" : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} kB`;

function BruksanvisningPage() {
  const load = useServerFn(listManuals);
  const doSearch = useServerFn(searchManuals);
  const doSaveUrl = useServerFn(saveManualFromUrl);
  const doSaveUpload = useServerFn(saveManualUpload);
  const doDelete = useServerFn(deleteManual);
  const doUpdate = useServerFn(updateManual);
  const doFileUrl = useServerFn(getManualFileUrl);

  const [rows, setRows] = useState<ManualRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<ManualCandidate[]>([]);
  const [searchNote, setSearchNote] = useState<string | null>(null);

  const [savingUrl, setSavingUrl] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [category, setCategory] = useState<string>("Annet");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<ManualRow>>({});

  async function refresh() {
    try {
      const data = await load({});
      setRows(data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke hente arkivet");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    const words = q.split(/\s+/);
    return rows.filter((r) => {
      const hay = [r.title, r.brand, r.model, r.category, r.notes, (r.tags ?? []).join(" ")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [rows, filter]);

  async function runSearch() {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    setCandidates([]);
    setSearchNote(null);
    try {
      const res = await doSearch({ data: { query: q } });
      setCandidates(res.candidates);
      setSearchNote(res.note);
      if (!title.trim()) setTitle(q);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Søket feilet");
    } finally {
      setSearching(false);
    }
  }

  async function saveFrom(url: string) {
    const t = (title.trim() || query.trim()).slice(0, 200);
    if (!t) {
      toast.error("Gi bruksanvisningen et navn først.");
      return;
    }
    setSavingUrl(url);
    try {
      const row = await doSaveUrl({
        data: {
          url,
          title: t,
          brand: brand.trim() || null,
          model: model.trim() || null,
          category,
          notes: notes.trim() || null,
          addedBy: getStoredWho() ?? null,
        },
      });
      setRows((r) => [row, ...r]);
      toast.success("Lagret som PDF i arkivet");
      setManualUrl("");
      setNotes("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke lagre PDF");
    } finally {
      setSavingUrl(null);
    }
  }

  async function onUpload(file: File) {
    const t = (title.trim() || file.name.replace(/\.pdf$/i, "")).slice(0, 200);
    setUploading(true);
    try {
      const base64: string = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("Kunne ikke lese filen"));
        fr.readAsDataURL(file);
      });
      const row = await doSaveUpload({
        data: {
          base64,
          title: t,
          brand: brand.trim() || null,
          model: model.trim() || null,
          category,
          notes: notes.trim() || null,
          addedBy: getStoredWho() ?? null,
        },
      });
      setRows((r) => [row, ...r]);
      toast.success("PDF lastet opp");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Opplasting feilet");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function openPdf(row: ManualRow) {
    if (!row.file_path) {
      if (row.source_url) window.open(row.source_url, "_blank");
      return;
    }
    try {
      const url = await doFileUrl({ data: { path: row.file_path } });
      window.open(url, "_blank");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke åpne PDF");
    }
  }

  async function removeRow(row: ManualRow) {
    if (!confirm(`Slette «${row.title}»?`)) return;
    try {
      await doDelete({ data: { id: row.id } });
      setRows((r) => r.filter((x) => x.id !== row.id));
      toast.success("Slettet");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke slette");
    }
  }

  async function saveEdit(row: ManualRow) {
    try {
      await doUpdate({
        data: {
          id: row.id,
          title: (editDraft.title ?? row.title) || row.title,
          brand: editDraft.brand ?? row.brand,
          model: editDraft.model ?? row.model,
          category: editDraft.category ?? row.category,
          notes: editDraft.notes ?? row.notes,
        },
      });
      setRows((rs) => rs.map((x) => (x.id === row.id ? ({ ...x, ...editDraft } as ManualRow) : x)));
      setEditId(null);
      setEditDraft({});
      toast.success("Oppdatert");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke lagre");
    }
  }

  return (
    <PageShell>
      <PageHero
        eyebrow="Arkivet"
        title="Bruksanvisning"
        subtitle="Søk opp manualen på nett, lagre den som PDF i borgens arkiv — og finn den igjen på sekundet."
        image={heroImg}
      />

      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Søk på nett */}
        <section className="rounded-xl border border-primary/30 bg-card/60 backdrop-blur p-4 sm:p-5 space-y-4">
          <h2 className="flex items-center gap-2 text-sm tracking-[0.2em] uppercase text-primary">
            <Search size={16} /> Finn bruksanvisning på nett
          </h2>

          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch();
              }}
              placeholder="F.eks. «Bosch WAU28T0SN vaskemaskin» eller «Gardena Sileno bruksanvisning»"
            />
            <Button onClick={() => void runSearch()} disabled={searching || query.trim().length < 2}>
              {searching ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
              <span className="ml-2">Søk</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Navn i arkivet</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Vaskemaskin – Bosch" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Merke</Label>
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Bosch" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Modell</Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="WAU28T0SN" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kategori</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Notat (valgfritt)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Står på vaskerommet, kjøpt 2023…"
            />
          </div>

          {searchNote && <p className="text-sm text-muted-foreground">{searchNote}</p>}

          {candidates.length > 0 && (
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60 overflow-hidden">
              {candidates.map((c) => (
                <li key={c.url} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 hover:bg-primary/5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {c.isPdf && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-mono">
                          PDF
                        </span>
                      )}
                      <span className="text-sm font-medium truncate">{c.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{c.host}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                    >
                      <ExternalLink size={13} /> Åpne
                    </a>
                    <Button size="sm" onClick={() => void saveFrom(c.url)} disabled={savingUrl === c.url}>
                      {savingUrl === c.url ? (
                        <Loader2 className="animate-spin" size={14} />
                      ) : (
                        <Save size={14} />
                      )}
                      <span className="ml-1">Lagre PDF</span>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-2 border-t border-border/60">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Link2 size={13} /> Lim inn direkte PDF-lenke
              </Label>
              <div className="flex gap-2">
                <Input
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  placeholder="https://…/manual.pdf"
                />
                <Button
                  variant="secondary"
                  onClick={() => void saveFrom(manualUrl.trim())}
                  disabled={!manualUrl.trim() || savingUrl === manualUrl.trim()}
                >
                  {savingUrl === manualUrl.trim() ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <Save size={16} />
                  )}
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Upload size={13} /> Eller last opp en PDF du har selv
              </Label>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onUpload(f);
                }}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-primary/15 file:text-primary"
              />
              {uploading && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="animate-spin" size={12} /> Laster opp…
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Arkivet */}
        <section className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
            <h2 className="flex items-center gap-2 text-sm tracking-[0.2em] uppercase text-primary">
              <BookOpen size={16} /> Arkivet ({rows.length})
            </h2>
            <div className="relative sm:w-80">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Søk i lagrede bruksanvisninger…"
                className="pl-8"
              />
              {filter && (
                <button
                  onClick={() => setFilter("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Tøm"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="animate-spin" size={14} /> Henter arkivet…
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {rows.length === 0
                ? "Ingen bruksanvisninger lagret ennå — søk etter en over."
                : "Ingen treff i arkivet."}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((r) => (
                <article
                  key={r.id}
                  className="rounded-xl border border-border/70 bg-card/60 backdrop-blur p-4 flex flex-col gap-2 hover:border-primary/50 transition-colors"
                >
                  {editId === r.id ? (
                    <div className="space-y-2">
                      <Input
                        defaultValue={r.title}
                        onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          defaultValue={r.brand ?? ""}
                          placeholder="Merke"
                          onChange={(e) => setEditDraft((d) => ({ ...d, brand: e.target.value }))}
                        />
                        <Input
                          defaultValue={r.model ?? ""}
                          placeholder="Modell"
                          onChange={(e) => setEditDraft((d) => ({ ...d, model: e.target.value }))}
                        />
                      </div>
                      <Textarea
                        defaultValue={r.notes ?? ""}
                        rows={2}
                        placeholder="Notat"
                        onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => void saveEdit(r)}>
                          <Save size={14} className="mr-1" /> Lagre
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditId(null);
                            setEditDraft({});
                          }}
                        >
                          Avbryt
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-medium truncate">{r.title}</h3>
                          <p className="text-xs text-muted-foreground truncate">
                            {[r.brand, r.model].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </div>
                        {r.category && (
                          <span className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                            {r.category}
                          </span>
                        )}
                      </div>

                      {r.notes && <p className="text-xs text-muted-foreground line-clamp-2">{r.notes}</p>}

                      <div className="text-[11px] text-muted-foreground font-mono">
                        {new Date(r.created_at).toLocaleDateString("nb-NO")}
                        {r.file_size ? ` · ${fmtSize(r.file_size)}` : ""}
                        {r.added_by ? ` · ${r.added_by}` : ""}
                      </div>

                      <div className="flex items-center gap-2 pt-1 mt-auto">
                        <Button size="sm" onClick={() => void openPdf(r)}>
                          <FileText size={14} className="mr-1" /> Åpne PDF
                        </Button>
                        {r.source_url && (
                          <a
                            href={r.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                          >
                            <ExternalLink size={13} /> Kilde
                          </a>
                        )}
                        <button
                          onClick={() => {
                            setEditId(r.id);
                            setEditDraft({});
                          }}
                          className="ml-auto text-muted-foreground hover:text-primary"
                          aria-label="Rediger"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => void removeRow(r)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Slett"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
