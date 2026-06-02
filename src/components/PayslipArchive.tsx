import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { ChevronDown, FileText, ExternalLink, Trash2, Eye, Sparkles } from "lucide-react";
import type { PayslipFile } from "@/lib/skatt.functions";
import { PayslipDetailDialog } from "@/components/PayslipDetailDialog";

const MONTH_NAMES = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];

export function PayslipArchive({
  files,
  openYears,
  setOpenYears,
  onDelete,
}: {
  files: PayslipFile[];
  openYears: Record<number, boolean>;
  setOpenYears: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  onDelete: (id: string) => void;
}) {
  const [localFiles, setLocalFiles] = useState<PayslipFile[]>(files);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Hold lokale filer i sync med props
  if (files !== undefined && files.length !== localFiles.length) {
    // enkel sync: oppdater bare hvis lengden endres (ny opplasting / sletting)
    // Detaljert tekst-sync gjøres via onTextUpdated.
  }

  const merged = useMemo<PayslipFile[]>(() => {
    const map = new Map(localFiles.map((f) => [f.id, f]));
    return files.map((f) => ({ ...f, ...(map.get(f.id) ?? {}) }));
  }, [files, localFiles]);

  const byYear = useMemo(() => {
    const m = new Map<number, PayslipFile[]>();
    for (const f of merged) {
      if (!m.has(f.year)) m.set(f.year, []);
      m.get(f.year)!.push(f);
    }
    return Array.from(m.entries()).sort((a, b) => b[0] - a[0]);
  }, [merged]);

  const active = activeId ? merged.find((f) => f.id === activeId) ?? null : null;

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Lønnsslipp-arkiv</h2>
          <p className="text-xs text-muted-foreground">
            Alle opplastede slipper — sortert per år. Klikk «Detaljer» for bilde med zoom og full tekst.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">{merged.length} filer</div>
      </div>

      {byYear.length === 0 && (
        <div className="text-sm text-muted-foreground py-4 text-center">
          Ingen filer lastet opp ennå.
        </div>
      )}

      <div className="space-y-2">
        {byYear.map(([y, list]) => {
          const open = !!openYears[y];
          return (
            <div key={y} className="rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setOpenYears((p) => ({ ...p, [y]: !open }))}
                className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/60 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ChevronDown
                    className={`size-4 transition-transform ${open ? "" : "-rotate-90"}`}
                  />
                  <span className="font-semibold">{y}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {list.length} {list.length === 1 ? "fil" : "filer"}
                </span>
              </button>
              {open && (
                <ul className="divide-y divide-border">
                  {list.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <FileText className="size-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0 max-w-[120px]">
                        <button
                          onClick={() => setActiveId(f.id)}
                          className="font-medium hover:underline inline-flex items-center gap-1 text-left whitespace-nowrap"
                          title={f.original_name || f.file_path.split("/").pop()}
                        >
                          <span className="truncate inline-block max-w-[80px] align-bottom">
                            {(f.original_name || f.file_path.split("/").pop() || "").slice(0, 10)}
                            {((f.original_name || f.file_path.split("/").pop() || "").length > 10) ? "…" : ""}
                          </span>
                          {f.extracted_text && <Sparkles className="size-3 text-primary shrink-0" />}
                        </button>
                        <div className="text-xs text-muted-foreground">
                          {f.month ? MONTH_NAMES[f.month - 1] : "—"}
                          {f.employer ? ` · ${f.employer}` : ""}
                          {" · "}
                          {new Date(f.uploaded_at).toLocaleDateString("nb-NO")}
                        </div>
                      </div>
                      <button
                        onClick={() => setActiveId(f.id)}
                        className="text-muted-foreground hover:text-primary p-1"
                        title="Vis detaljer"
                      >
                        <Eye className="size-4" />
                      </button>
                      <a
                        href={f.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary p-1"
                        title="Åpne original"
                      >
                        <ExternalLink className="size-4" />
                      </a>
                      <button
                        onClick={() => onDelete(f.id)}
                        className="text-muted-foreground hover:text-red-500 p-1"
                        title="Slett"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <PayslipDetailDialog
        file={active}
        open={!!active}
        onOpenChange={(v) => { if (!v) setActiveId(null); }}
        onTextUpdated={(id, text) => {
          setLocalFiles((prev) => {
            const exists = prev.find((p) => p.id === id);
            const base = files.find((f) => f.id === id);
            if (!base) return prev;
            const next: PayslipFile = { ...base, ...exists, extracted_text: text, extracted_at: new Date().toISOString() };
            const filtered = prev.filter((p) => p.id !== id);
            return [...filtered, next];
          });
        }}
      />
    </Card>
  );
}
