import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Camera,
  Upload,
  Loader2,
  Search,
  X,
  Trash2,
  Pencil,
  Save,
  Plus,
  Send,
  PackageOpen,
  PackageCheck,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarClock,
  AlertTriangle,
} from "lucide-react";
import { PageShell, PageHero } from "@/components/PageShell";
import { getStoredWho } from "@/lib/push-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { compressImageToWebp } from "@/lib/image-compress";
import { sendLoanTestPush } from "@/lib/loans-push.functions";
import heroImg from "@/assets/got-utlan.jpg";
import { toast } from "sonner";

export const Route = createFileRoute("/utlan")({
  head: () => ({
    meta: [
      { title: "Utlån & Lånt — Husets ting på vandring | House Pettersen Riis" },
      {
        name: "description",
        content:
          "Hold styr på ting husets folk har lånt bort eller lånt inn — med bilde, forventet retur og påminnelser.",
      },
      { property: "og:title", content: "Utlån & Lånt — House Pettersen Riis" },
      {
        property: "og:description",
        content: "Utlånsboken for borgen: hvem har hva, når skal det tilbake?",
      },
      { property: "og:image", content: heroImg },
    ],
  }),
  component: UtlanPage,
});

type Direction = "utlan" | "lant";

type LoanRow = {
  id: string;
  direction: Direction;
  item: string;
  person: string;
  notes: string | null;
  lent_at: string;
  expected_return: string | null;
  returned_at: string | null;
  image_url: string | null;
  image_path: string | null;
  added_by: string;
  recipient: string;
  reminder_sent_at: string | null;
  overdue_notified_at: string | null;
  created_at: string;
  updated_at: string;
};

const WHO_OPTIONS = ["Alle", "Arne & Rebekka", "Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"] as const;

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("nb-NO", { day: "2-digit", month: "short", year: "numeric" });
};

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.round((db - da) / 86400000);
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function signedUrlFor(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from("loans")
    .createSignedUrl(path, 60 * 60 * 6);
  if (error) return null;
  return data?.signedUrl ?? null;
}

function UtlanPage() {
  const [rows, setRows] = useState<LoanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Direction | "arkiv">("utlan");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LoanRow | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const testPush = useServerFn(sendLoanTestPush);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("loans")
      .select("*")
      .order("returned_at", { ascending: true, nullsFirst: true })
      .order("expected_return", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) toast.error("Kunne ikke laste utlån");
    setRows(((data as any[]) ?? []) as LoanRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("loans_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "loans" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as LoanRow;
            setRows((prev) => (prev.some((r) => r.id === row.id) ? prev : [row, ...prev]));
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as LoanRow;
            setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
          } else if (payload.eventType === "DELETE") {
            const id = (payload.old as any).id as string;
            setRows((prev) => prev.filter((r) => r.id !== id));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  // Resolve signed URLs for images
  useEffect(() => {
    const missing = rows.filter((r) => r.image_path && !signedUrls[r.image_path]);
    if (missing.length === 0) return;
    (async () => {
      const next: Record<string, string> = {};
      for (const r of missing) {
        const u = await signedUrlFor(r.image_path);
        if (u && r.image_path) next[r.image_path] = u;
      }
      if (Object.keys(next).length) setSignedUrls((prev) => ({ ...prev, ...next }));
    })();
  }, [rows, signedUrls]);

  const filtered = useMemo(() => {
    let list = rows;
    if (tab === "arkiv") list = list.filter((r) => r.returned_at);
    else list = list.filter((r) => !r.returned_at && r.direction === tab);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.item.toLowerCase().includes(q) ||
          r.person.toLowerCase().includes(q) ||
          (r.notes ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, tab, query]);

  const counts = useMemo(() => {
    const utlan = rows.filter((r) => !r.returned_at && r.direction === "utlan").length;
    const lant = rows.filter((r) => !r.returned_at && r.direction === "lant").length;
    const arkiv = rows.filter((r) => r.returned_at).length;
    const overdue = rows.filter(
      (r) => !r.returned_at && r.expected_return && r.expected_return < todayIso(),
    ).length;
    return { utlan, lant, arkiv, overdue };
  }, [rows]);

  const markReturned = async (r: LoanRow) => {
    const { error } = await supabase
      .from("loans")
      .update({ returned_at: todayIso() })
      .eq("id", r.id);
    if (error) toast.error("Klarte ikke markere som returnert");
    else toast.success(r.direction === "utlan" ? "Merket som fått tilbake" : "Merket som levert tilbake");
  };

  const unreturn = async (r: LoanRow) => {
    const { error } = await supabase.from("loans").update({ returned_at: null }).eq("id", r.id);
    if (error) toast.error("Klarte ikke å angre retur");
  };

  const removeRow = async (r: LoanRow) => {
    if (!confirm(`Slette "${r.item}"?`)) return;
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    const { error } = await supabase.from("loans").delete().eq("id", r.id);
    if (error) {
      toast.error("Kunne ikke slette");
      load();
      return;
    }
    if (r.image_path) await supabase.storage.from("loans").remove([r.image_path]);
    toast.success("Slettet");
  };

  const sendTest = async (r: LoanRow) => {
    try {
      const res = await testPush({ data: { loanId: r.id } });
      toast.success(`Test-varsel sendt (${res.sent} ok / ${res.errors} feil)`);
    } catch (e) {
      toast.error(`Kunne ikke sende test: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <PageShell>
      <PageHero
        eyebrow="Husets utlånsbok"
        title="Utlån & Lånt"
        subtitle="Hvem har lånt hva, når skal det tilbake — med bilde og påminnelser."
        image={heroImg}
      />

      <section className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex flex-wrap gap-2">
            <TabBtn active={tab === "utlan"} onClick={() => setTab("utlan")}>
              <ArrowUpFromLine size={14} /> Utlånt <Badge>{counts.utlan}</Badge>
            </TabBtn>
            <TabBtn active={tab === "lant"} onClick={() => setTab("lant")}>
              <ArrowDownToLine size={14} /> Lånt <Badge>{counts.lant}</Badge>
            </TabBtn>
            <TabBtn active={tab === "arkiv"} onClick={() => setTab("arkiv")}>
              <PackageCheck size={14} /> Arkiv <Badge>{counts.arkiv}</Badge>
            </TabBtn>
          </div>
          <Button onClick={() => { setEditing(null); setShowForm(true); }} className="gap-1">
            <Plus size={16} /> Nytt utlån / lån
          </Button>
        </div>

        {counts.overdue > 0 && tab !== "arkiv" && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 px-3 py-2 text-sm flex items-center gap-2">
            <AlertTriangle size={16} />
            {counts.overdue} ting er over forfallsdato.
          </div>
        )}

        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Søk på ting, person eller notat…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="text-center py-10 text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Laster…
          </div>
        ) : filtered.length === 0 ? (
          <div className="panel rounded-lg p-8 text-center text-muted-foreground">
            <PackageOpen className="mx-auto mb-3 opacity-60" />
            Ingenting her ennå.
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((r) => (
              <LoanCard
                key={r.id}
                row={r}
                signedUrl={r.image_path ? signedUrls[r.image_path] : null}
                onOpenImage={(u) => setLightbox(u)}
                onReturn={() => markReturned(r)}
                onUnreturn={() => unreturn(r)}
                onEdit={() => { setEditing(r); setShowForm(true); }}
                onDelete={() => removeRow(r)}
                onTest={() => sendTest(r)}
              />
            ))}
          </div>
        )}
      </section>

      {showForm && (
        <LoanForm
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-2 rounded-full bg-background/80 border border-border"
            onClick={() => setLightbox(null)}
            aria-label="Lukk"
          >
            <X size={18} />
          </button>
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain rounded" />
        </div>
      )}
    </PageShell>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background/60 text-foreground/80 border-border hover:bg-background"
      }`}
    >
      {children}
    </button>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-background/40 border border-border/60 px-1.5 py-0.5 text-[10px]">
      {children}
    </span>
  );
}

function LoanCard({
  row,
  signedUrl,
  onOpenImage,
  onReturn,
  onUnreturn,
  onEdit,
  onDelete,
  onTest,
}: {
  row: LoanRow;
  signedUrl: string | null;
  onOpenImage: (u: string) => void;
  onReturn: () => void;
  onUnreturn: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
}) {
  const today = todayIso();
  const overdue = !row.returned_at && row.expected_return && row.expected_return < today;
  const dueToday = !row.returned_at && row.expected_return === today;
  const daysLeft = row.expected_return && !row.returned_at ? daysBetween(today, row.expected_return) : null;

  const statusChip = row.returned_at ? (
    <span className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
      Returnert {fmtDate(row.returned_at)}
    </span>
  ) : overdue ? (
    <span className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30">
      {Math.abs(daysLeft!)} dager forsinket
    </span>
  ) : dueToday ? (
    <span className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
      Forfaller i dag
    </span>
  ) : daysLeft != null ? (
    <span className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/30">
      {daysLeft} d igjen
    </span>
  ) : (
    <span className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded bg-muted/40 text-muted-foreground border border-border">
      Ingen dato
    </span>
  );

  const dirLabel = row.direction === "utlan" ? "Utlånt til" : "Lånt av";
  const DirIcon = row.direction === "utlan" ? ArrowUpFromLine : ArrowDownToLine;

  return (
    <article className="panel rounded-lg p-3 flex gap-3">
      <button
        type="button"
        onClick={() => signedUrl && onOpenImage(signedUrl)}
        className="relative shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-md overflow-hidden bg-muted/40 border border-border"
        aria-label="Vis bilde"
      >
        {signedUrl ? (
          <img src={signedUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <PackageOpen size={22} />
          </div>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <DirIcon size={14} className={row.direction === "utlan" ? "text-amber-400" : "text-sky-400"} />
          <h3 className="text-base font-medium text-foreground truncate">{row.item}</h3>
          {statusChip}
        </div>
        <div className="mt-1 text-sm text-muted-foreground truncate">
          {dirLabel} <span className="text-foreground/90">{row.person}</span>
          {row.recipient && row.recipient !== "Alle" && (
            <> · Ansvarlig: <span className="text-foreground/80">{row.recipient}</span></>
          )}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground flex flex-wrap gap-x-3">
          <span className="inline-flex items-center gap-1">
            <CalendarClock size={11} /> Ut: {fmtDate(row.lent_at)}
          </span>
          {row.expected_return && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock size={11} /> Retur: {fmtDate(row.expected_return)}
            </span>
          )}
        </div>
        {row.notes && (
          <p className="mt-1.5 text-sm text-foreground/80 whitespace-pre-wrap">{row.notes}</p>
        )}

        <div className="mt-2 flex flex-wrap gap-2">
          {!row.returned_at ? (
            <Button size="sm" variant="secondary" onClick={onReturn} className="gap-1">
              <PackageCheck size={14} /> {row.direction === "utlan" ? "Fikk tilbake" : "Levert tilbake"}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={onUnreturn} className="gap-1">
              Angre retur
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onEdit} className="gap-1">
            <Pencil size={14} /> Rediger
          </Button>
          {!row.returned_at && row.expected_return && (
            <Button size="sm" variant="ghost" onClick={onTest} className="gap-1">
              <Send size={14} /> Test push
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDelete} className="gap-1 text-red-400 hover:text-red-300">
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
    </article>
  );
}

function LoanForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: LoanRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [direction, setDirection] = useState<Direction>(initial?.direction ?? "utlan");
  const [item, setItem] = useState(initial?.item ?? "");
  const [person, setPerson] = useState(initial?.person ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lentAt, setLentAt] = useState(initial?.lent_at ?? todayIso());
  const [expected, setExpected] = useState(initial?.expected_return ?? "");
  const [recipient, setRecipient] = useState(initial?.recipient ?? (getStoredWho() || "Alle"));
  const [file, setFile] = useState<File | null>(null);
  const [existingPath, setExistingPath] = useState<string | null>(initial?.image_path ?? null);
  const [existingUrl, setExistingUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!existingPath) { setExistingUrl(null); return; }
    signedUrlFor(existingPath).then(setExistingUrl);
  }, [existingPath]);

  const save = async () => {
    if (!item.trim()) { toast.error("Ting mangler"); return; }
    if (!person.trim()) { toast.error("Person mangler"); return; }
    setBusy(true);
    try {
      let image_path = existingPath;
      let image_url = initial?.image_url ?? null;
      if (file) {
        const compressed = await compressImageToWebp(file).catch(() => file);
        const ext = compressed.name.split(".").pop()?.toLowerCase() || "webp";
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("loans")
          .upload(path, compressed, { contentType: compressed.type, upsert: false });
        if (upErr) throw upErr;
        // Slett gammelt bilde om det finnes
        if (existingPath) await supabase.storage.from("loans").remove([existingPath]);
        image_path = path;
        const { data } = supabase.storage.from("loans").getPublicUrl(path);
        image_url = data.publicUrl;
      }
      const payload = {
        direction,
        item: item.trim(),
        person: person.trim(),
        notes: notes.trim() || null,
        lent_at: lentAt || todayIso(),
        expected_return: expected || null,
        image_path,
        image_url,
        recipient,
        added_by: getStoredWho() || "Alle",
        // Nullstill varselstatus hvis dato endres
        reminder_sent_at: null,
        overdue_notified_at: null,
      };
      if (initial) {
        const { error } = await supabase.from("loans").update(payload).eq("id", initial.id);
        if (error) throw error;
        toast.success("Oppdatert");
      } else {
        const { error } = await supabase.from("loans").insert(payload);
        if (error) throw error;
        toast.success("Lagt til");
      }
      onSaved();
    } catch (e) {
      toast.error(`Feil: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto p-4">
      <div className="max-w-lg mx-auto panel rounded-lg p-4 my-6 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full bg-background/80 border border-border"
          aria-label="Lukk"
        >
          <X size={16} />
        </button>
        <h2 className="text-lg font-medium mb-4">
          {initial ? "Rediger" : "Nytt utlån / lån"}
        </h2>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            onClick={() => setDirection("utlan")}
            className={`px-3 py-2 rounded-md border text-sm flex items-center justify-center gap-1 ${
              direction === "utlan" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            <ArrowUpFromLine size={14} /> Jeg lånte ut
          </button>
          <button
            type="button"
            onClick={() => setDirection("lant")}
            className={`px-3 py-2 rounded-md border text-sm flex items-center justify-center gap-1 ${
              direction === "lant" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            <ArrowDownToLine size={14} /> Jeg lånte
          </button>
        </div>

        <div className="grid gap-3">
          <div>
            <Label>Hva</Label>
            <Input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Drill, bok, henger…" />
          </div>
          <div>
            <Label>{direction === "utlan" ? "Utlånt til" : "Lånt av"}</Label>
            <Input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Navn" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Dato ut</Label>
              <Input type="date" value={lentAt} onChange={(e) => setLentAt(e.target.value)} />
            </div>
            <div>
              <Label>Forventet retur</Label>
              <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Ansvarlig (push-mottaker)</Label>
            <select
              className="w-full h-9 px-2 rounded-md bg-background border border-border text-sm"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            >
              {WHO_OPTIONS.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Notat</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detaljer, tilbehør, tilstand…" />
          </div>

          <div>
            <Label>Bilde</Label>
            <div className="mt-1 flex gap-2 items-start">
              <div className="w-24 h-24 rounded-md overflow-hidden bg-muted/40 border border-border shrink-0">
                {preview ? (
                  <img src={preview} alt="" className="w-full h-full object-cover" />
                ) : existingUrl ? (
                  <img src={existingUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <PackageOpen size={22} />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <Button type="button" size="sm" variant="secondary" onClick={() => cameraRef.current?.click()} className="gap-1">
                  <Camera size={14} /> Ta bilde
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => fileRef.current?.click()} className="gap-1">
                  <Upload size={14} /> Velg fil
                </Button>
                {(file || existingPath) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => { setFile(null); setExistingPath(null); setExistingUrl(null); }}
                    className="gap-1 text-red-400"
                  >
                    <Trash2 size={14} /> Fjern bilde
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Avbryt</Button>
          <Button onClick={save} disabled={busy} className="gap-1">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Lagre
          </Button>
        </div>
      </div>
    </div>
  );
}
