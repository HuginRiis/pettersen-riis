import { useState, type ReactNode } from "react";
import { Maximize2, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

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
 * med mer detaljert versjon. Bruker en ren zoom-inn/-ut animasjon
 * (ingen sideglid) for en mer "popp" følelse.
 */
export function ChartZoom({ title, subtitle, children, detail, footer, className }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group relative block w-full text-left rounded-md transition-all duration-200 hover:bg-foreground/[0.04] hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.25),0_8px_24px_-12px_hsl(var(--primary)/0.35)] focus:outline-none focus:ring-1 focus:ring-primary/60 ${className ?? ""}`}
        title="Klikk for detaljer"
      >
        {children}
        <span
          aria-hidden
          className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-background/70 backdrop-blur-sm opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all pointer-events-none ring-1 ring-border/60"
        >
          <Maximize2 size={10} className="text-primary" />
        </span>
      </button>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          {/* Backdrop — fade + blur */}
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-50 bg-background/70 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:duration-300 data-[state=closed]:duration-200"
          />
          {/* Content — ren zoom (ingen sideglid), litt lengre varighet for "popp" */}
          <DialogPrimitive.Content
            className="fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-4xl -translate-x-1/2 -translate-y-1/2 origin-center
              rounded-2xl border border-border/60
              bg-gradient-to-br from-background via-background to-muted/40
              shadow-[0_20px_60px_-15px_hsl(var(--primary)/0.35),0_0_0_1px_hsl(var(--primary)/0.15)]
              p-5 sm:p-6
              data-[state=open]:animate-in data-[state=closed]:animate-out
              data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
              data-[state=closed]:zoom-out-75 data-[state=open]:zoom-in-75
              data-[state=open]:duration-300 data-[state=closed]:duration-200
              ease-out
              focus:outline-none"
          >
            {/* Glød på topp */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
            />

            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-display text-primary tracking-wider uppercase text-base sm:text-lg leading-tight">
                  {title}
                </DialogPrimitive.Title>
                {subtitle && (
                  <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
                )}
              </div>
              <DialogPrimitive.Close
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full
                  bg-muted/50 ring-1 ring-border/60
                  text-muted-foreground hover:text-foreground hover:bg-muted
                  transition-all hover:scale-110 active:scale-95
                  focus:outline-none focus:ring-2 focus:ring-primary/60"
                aria-label="Lukk"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>

            <div className="rounded-xl bg-background/40 ring-1 ring-border/40 p-3 sm:p-4">
              {detail ?? children}
            </div>

            {footer && (
              <div className="mt-4 text-xs text-muted-foreground leading-relaxed">
                {footer}
              </div>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
