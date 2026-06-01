import { useState, type ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  title: string;
  subtitle?: string;
  /** Innholdet som vises inline (liten/komprimert) */
  children: ReactNode;
  /** Innholdet som vises i dialogen (større/mer detaljert). Default = children */
  detail?: ReactNode;
  /** Ekstra info under detaljgrafen */
  footer?: ReactNode;
  className?: string;
};

/**
 * Wrapper som gjør hvilken som helst graf klikkbar — åpner en stor dialog
 * med mer detaljert versjon. Bruk for alle grafer som har "skjulte" detaljer.
 */
export function ChartZoom({ title, subtitle, children, detail, footer, className }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group relative block w-full text-left rounded-md transition hover:bg-foreground/[0.03] focus:outline-none focus:ring-1 focus:ring-primary/60 ${className ?? ""}`}
        title="Klikk for detaljer"
      >
        {children}
        <span
          aria-hidden
          className="absolute top-1 right-1 opacity-50 group-hover:opacity-100 transition pointer-events-none"
        >
          <Maximize2 size={11} className="text-muted-foreground" />
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl w-[95vw] panel border-border">
          <DialogHeader>
            <DialogTitle className="text-display text-primary tracking-wider uppercase text-base">
              {title}
            </DialogTitle>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </DialogHeader>
          <div className="mt-2">{detail ?? children}</div>
          {footer && <div className="mt-3 text-xs text-muted-foreground">{footer}</div>}
        </DialogContent>
      </Dialog>
    </>
  );
}
