import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ZoomIn, ZoomOut, RotateCcw, ExternalLink, Sparkles, FileText } from "lucide-react";
import { extractPayslipText, type PayslipFile } from "@/lib/skatt.functions";
import { toast } from "sonner";

const MONTH_NAMES = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];

function formatBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function PayslipDetailDialog({
  file,
  open,
  onOpenChange,
  onTextUpdated,
}: {
  file: PayslipFile | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onTextUpdated?: (id: string, text: string) => void;
}) {
  const extract = useServerFn(extractPayslipText);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<{ x: number; y: number } | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && file) {
      setScale(1);
      setPos({ x: 0, y: 0 });
      setText(file.extracted_text ?? null);
    }
  }, [open, file]);

  if (!file) return null;
  const isImage = (file.mime_type ?? "").startsWith("image/");
  const isPdf = (file.mime_type ?? "").includes("pdf");

  const runExtract = async (force = false) => {
    setLoading(true);
    try {
      const res = await extract({ data: { id: file.id, force } });
      setText(res.text);
      onTextUpdated?.(file.id, res.text);
      toast.success(res.cached ? "Hentet lagret tekst" : "Detaljer hentet ut");
    } catch (e: any) {
      toast.error(e?.message ?? "Klarte ikke hente detaljer");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            {file.original_name || file.file_path.split("/").pop()}
          </DialogTitle>
          <DialogDescription>
            {file.month ? MONTH_NAMES[file.month - 1] : "Ukjent måned"} {file.year}
            {file.employer ? ` · ${file.employer}` : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Bilde med zoom */}
        {isImage && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}>
                <ZoomOut className="size-4" />
              </Button>
              <span className="text-xs tabular-nums w-12 text-center">{Math.round(scale * 100)}%</span>
              <Button size="sm" variant="outline" onClick={() => setScale((s) => Math.min(5, s + 0.25))}>
                <ZoomIn className="size-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setScale(1); setPos({ x: 0, y: 0 }); }}>
                <RotateCcw className="size-4" /> Nullstill
              </Button>
              <a
                href={file.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-primary ml-auto"
              >
                Åpne original <ExternalLink className="size-3" />
              </a>
            </div>
            <div
              className="relative w-full h-[55vh] overflow-hidden rounded-md border border-border bg-muted/20 select-none touch-none"
              onMouseDown={(e) => setDragging({ x: e.clientX - pos.x, y: e.clientY - pos.y })}
              onMouseMove={(e) => {
                if (!dragging) return;
                setPos({ x: e.clientX - dragging.x, y: e.clientY - dragging.y });
              }}
              onMouseUp={() => setDragging(null)}
              onMouseLeave={() => setDragging(null)}
              onWheel={(e) => {
                e.preventDefault();
                setScale((s) => Math.max(0.5, Math.min(5, s + (e.deltaY < 0 ? 0.15 : -0.15))));
              }}
              onDoubleClick={() => setScale((s) => (s >= 2 ? 1 : 2))}
              style={{ cursor: dragging ? "grabbing" : scale > 1 ? "grab" : "zoom-in" }}
            >
              <img
                src={file.file_url}
                alt={file.original_name ?? "Lønnslipp"}
                draggable={false}
                className="absolute inset-0 m-auto max-w-none transition-transform"
                style={{
                  transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
                  transformOrigin: "center center",
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Scroll for å zoome · dra for å flytte · dobbeltklikk for å veksle
            </p>
          </div>
        )}

        {isPdf && (
          <div className="space-y-2">
            <iframe
              src={file.file_url}
              title={file.original_name ?? "Lønnslipp"}
              className="w-full h-[55vh] rounded-md border border-border bg-muted/20"
            />
            <a
              href={file.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-primary"
            >
              Åpne i nytt vindu <ExternalLink className="size-3" />
            </a>
          </div>
        )}

        {!isImage && !isPdf && (
          <a
            href={file.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm inline-flex items-center gap-1 text-primary hover:underline"
          >
            Åpne fil <ExternalLink className="size-3" />
          </a>
        )}

        {/* Detaljer som tekst */}
        <div className="rounded-md border border-border p-3 text-sm space-y-1">
          <div className="font-semibold mb-1">Filinfo</div>
          <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">År</dt><dd>{file.year}</dd>
            <dt className="text-muted-foreground">Måned</dt><dd>{file.month ? MONTH_NAMES[file.month - 1] : "—"}</dd>
            <dt className="text-muted-foreground">Arbeidsgiver</dt><dd>{file.employer || "—"}</dd>
            <dt className="text-muted-foreground">Filnavn</dt><dd className="break-all">{file.original_name || "—"}</dd>
            <dt className="text-muted-foreground">Filtype</dt><dd>{file.mime_type || "—"}</dd>
            <dt className="text-muted-foreground">Størrelse</dt><dd>{formatBytes(file.size_bytes)}</dd>
            <dt className="text-muted-foreground">Lastet opp</dt><dd>{new Date(file.uploaded_at).toLocaleString("nb-NO")}</dd>
            {file.extracted_at && (
              <>
                <dt className="text-muted-foreground">Analysert</dt>
                <dd>{new Date(file.extracted_at).toLocaleString("nb-NO")}</dd>
              </>
            )}
          </dl>
        </div>

        {/* AI-tekst */}
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold text-sm flex items-center gap-2">
              <Sparkles className="size-4 text-primary" /> Detaljer fra slippen
            </div>
            <Button
              size="sm"
              variant={text ? "outline" : "default"}
              disabled={loading}
              onClick={() => runExtract(!!text)}
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {text ? "Hent på nytt" : "Hent detaljer"}
            </Button>
          </div>
          {text ? (
            <pre className="whitespace-pre-wrap text-xs leading-relaxed font-serif text-amber-950 dark:text-amber-100 bg-amber-50/90 dark:bg-amber-950/30 border border-amber-700/40 rounded-md p-4 shadow-inner">
              {text}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Ingen pergamentrull åpnet ennå. Klikk «Hent detaljer» for å la maesteren ved Citadellet lese slippen og skrive ut hele krønnika.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
