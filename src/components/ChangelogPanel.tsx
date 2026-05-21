import { useEffect, useMemo, useState } from "react";
import { ScrollText, Plus, Loader2, Trash2, ChevronDown, ChevronUp, Download, Code2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  listChangelog,
  upsertChangelog,
  deleteChangelog,
  deleteAllChangelog,
  type ChangelogEntry,
  type ChangelogCategory,
} from "@/server/changelog.functions";

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("nb-NO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Filter = "all" | ChangelogCategory;

export function ChangelogPanel() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [when, setWhen] = useState<string>(toLocalInputValue(new Date()));
  const [category, setCategory] = useState<ChangelogCategory>("app");

  async function refresh() {
    try {
      const list = await listChangelog();
      setEntries(list);
    } catch (e) {
      console.error(e);
      toast.error("Kunne ikke laste endringslogg");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleAdd() {
    if (!title.trim()) {
      toast.error("Skriv en tittel");
      return;
    }
    setAdding(true);
    try {
      await upsertChangelog({
        data: {
          title: title.trim(),
          description: description.trim() || null,
          changed_at: when ? new Date(when).toISOString() : new Date().toISOString(),
          category,
        },
      });
      setTitle("");
      setDescription("");
      setWhen(toLocalInputValue(new Date()));
      setShowForm(false);
      toast.success("Endring lagt til");
      await refresh();
    } catch (e) {
      console.error(e);
      toast.error("Kunne ikke lagre");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Slette denne oppføringen?")) return;
    try {
      await deleteChangelog({ data: { id } });
      setEntries((cur) => cur.filter((e) => e.id !== id));
    } catch {
      toast.error("Kunne ikke slette");
    }
  }

  async function handleDeleteAll() {
    if (entries.length === 0) return;
    if (!confirm(`Slette alle ${entries.length} oppføringer i endringsloggen? Dette kan ikke angres.`)) return;
    try {
      await deleteAllChangelog();
      setEntries([]);
      toast.success("Endringsloggen er tømt");
    } catch {
      toast.error("Kunne ikke slette alle");
    }
  }


  const filtered = useMemo(
    () => (filter === "all" ? entries : entries.filter((e) => e.category === filter)),
    [entries, filter],
  );

  function handleExport() {
    if (filtered.length === 0) {
      toast.error("Ingen endringer å eksportere");
      return;
    }
    try {
      const payload = {
        exported_at: new Date().toISOString(),
        filter,
        count: filtered.length,
        entries: filtered.map((e) => ({
          changed_at: e.changed_at,
          category: e.category,
          title: e.title,
          description: e.description,
        })),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `endringslogg-${filter}-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Endringslogg eksportert");
    } catch {
      toast.error("Kunne ikke eksportere");
    }
  }

  const visible = expanded ? filtered.slice(0, 300) : filtered.slice(0, 5);
  const hasMore = filtered.length > 5;
  const moreCount = Math.min(300, filtered.length) - 5;

  const counts = useMemo(
    () => ({
      all: entries.length,
      code: entries.filter((e) => e.category === "code").length,
      app: entries.filter((e) => e.category === "app").length,
    }),
    [entries],
  );

  const filterBtn = (key: Filter, label: string, Icon?: typeof Code2) => (
    <button
      type="button"
      onClick={() => setFilter(key)}
      className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border inline-flex items-center gap-1 transition-colors ${
        filter === key
          ? "bg-primary/15 border-primary/60 text-primary"
          : "border-primary/20 text-muted-foreground hover:text-foreground hover:border-primary/40"
      }`}
    >
      {Icon ? <Icon size={10} /> : null}
      {label} ({counts[key]})
    </button>
  );

  return (
    <div className="panel rounded-lg p-5">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ScrollText size={16} className="text-primary" />
          <div className="text-display text-primary text-sm tracking-[0.2em] uppercase">
            Endringslogg
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="h-7 px-2 text-xs"
            title="Eksporter som JSON"
          >
            <Download size={12} className="mr-1" />
            Eksporter
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleDeleteAll}
            disabled={entries.length === 0}
            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
            title="Slett alle oppføringer"
          >
            <Trash2 size={12} className="mr-1" />
            Slett alt
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setShowForm((v) => !v)}
            className="h-7 px-2 text-xs"
          >
            <Plus size={12} className="mr-1" />
            {showForm ? "Avbryt" : "Legg til"}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-4 flex-wrap">
        {filterBtn("all", "Alle")}
        {filterBtn("code", "Kode", Code2)}
        {filterBtn("app", "App", Smartphone)}
      </div>

      {showForm && (
        <div className="rounded border border-dashed border-primary/30 p-3 mb-4 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Tittel
              </span>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="F.eks. La til varsling for lys"
                className="h-8 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Tidspunkt
              </span>
              <Input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="h-8 text-xs"
              />
            </label>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Type
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setCategory("app")}
                className={`text-[11px] px-3 py-1.5 rounded border inline-flex items-center gap-1 transition-colors ${
                  category === "app"
                    ? "bg-primary/15 border-primary/60 text-primary"
                    : "border-primary/20 text-muted-foreground hover:border-primary/40"
                }`}
              >
                <Smartphone size={11} /> App-handling
              </button>
              <button
                type="button"
                onClick={() => setCategory("code")}
                className={`text-[11px] px-3 py-1.5 rounded border inline-flex items-center gap-1 transition-colors ${
                  category === "code"
                    ? "bg-primary/15 border-primary/60 text-primary"
                    : "border-primary/20 text-muted-foreground hover:border-primary/40"
                }`}
              >
                <Code2 size={11} /> Kode-endring
              </button>
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Beskrivelse (valgfritt)
            </span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="text-xs"
              placeholder="Detaljer om hva som ble endret"
            />
          </label>
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={handleAdd} disabled={adding}>
              {adding ? (
                <Loader2 size={14} className="animate-spin mr-1" />
              ) : (
                <Plus size={14} className="mr-1" />
              )}
              Lagre
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Laster …
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          Ingen endringer i dette filteret enda.
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {visible.map((e) => {
              const isCode = e.category === "code";
              return (
                <li
                  key={e.id}
                  className="rounded border border-primary/15 p-3 bg-background/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-[10px] tracking-wider uppercase text-muted-foreground">
                          {fmtDate(e.changed_at)}
                        </div>
                        <span
                          className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${
                            isCode
                              ? "border-primary/40 text-primary bg-primary/10"
                              : "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                          }`}
                        >
                          {isCode ? <Code2 size={9} /> : <Smartphone size={9} />}
                          {isCode ? "Kode" : "App"}
                        </span>
                      </div>
                      <div className="text-sm text-foreground font-medium">{e.title}</div>
                      {e.description && (
                        <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                          {e.description}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(e.id)}
                      className="text-destructive/70 hover:text-destructive shrink-0"
                      aria-label="Slett"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {hasMore && (
            <div className="flex justify-center mt-3">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-[11px] uppercase tracking-[0.2em] text-primary hover:text-primary/80 border border-primary/30 hover:border-primary/60 rounded-full px-4 py-1.5 transition-colors inline-flex items-center gap-1"
              >
                {expanded ? (
                  <>
                    <ChevronUp size={12} /> Vis færre
                  </>
                ) : (
                  <>
                    <ChevronDown size={12} /> Vis flere ({moreCount} til)
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
