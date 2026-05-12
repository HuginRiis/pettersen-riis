import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { ChevronDown, FileText, ExternalLink, Trash2 } from "lucide-react";
import type { PayslipFile } from "@/server/skatt.functions";

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
  const byYear = useMemo(() => {
    const m = new Map<number, PayslipFile[]>();
    for (const f of files) {
      if (!m.has(f.year)) m.set(f.year, []);
      m.get(f.year)!.push(f);
    }
    return Array.from(m.entries()).sort((a, b) => b[0] - a[0]);
  }, [files]);

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Lønnsslipp-arkiv</h2>
          <p className="text-xs text-muted-foreground">
            Alle opplastede slipper — sortert per år. Klikk for å åpne.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">{files.length} filer</div>
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
                      <div className="flex-1 min-w-0">
                        <a
                          href={f.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:underline truncate inline-flex items-center gap-1"
                        >
                          {f.original_name || f.file_path.split("/").pop()}
                          <ExternalLink className="size-3 opacity-60" />
                        </a>
                        <div className="text-xs text-muted-foreground">
                          {f.month ? MONTH_NAMES[f.month - 1] : "—"}
                          {f.employer ? ` · ${f.employer}` : ""}
                          {" · "}
                          {new Date(f.uploaded_at).toLocaleDateString("nb-NO")}
                        </div>
                      </div>
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
    </Card>
  );
}
