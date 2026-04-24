import { useUiScale } from "@/hooks/use-ui-scale";
import { cn } from "@/lib/utils";

export function UiScaleToggle() {
  const { scale, setScale } = useUiScale();
  const isLarge = scale === "large";

  return (
    <section className="container mx-auto px-4 pt-6">
      <div className="max-w-3xl mx-auto panel rounded-lg p-3 sm:p-4 flex items-center justify-between gap-3 border border-primary/30">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-[9px] sm:text-[10px] tracking-[0.3em] uppercase text-primary/80 shrink-0">
            Visning
          </div>
          <div className="text-xs sm:text-sm text-muted-foreground truncate">
            {isLarge ? "Stor (150 %)" : "Normal"}
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Velg visningsstørrelse"
          className="relative flex items-center bg-secondary/60 border border-border rounded-full p-1 shrink-0"
        >
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-full bg-primary transition-transform duration-300 ease-out",
              isLarge ? "translate-x-[calc(100%+0.25rem)]" : "translate-x-0",
            )}
          />
          <button
            type="button"
            role="tab"
            aria-selected={!isLarge}
            onClick={() => setScale("normal")}
            className={cn(
              "relative z-10 px-3 sm:px-4 py-1.5 text-xs tracking-[0.2em] uppercase rounded-full transition-colors",
              !isLarge ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Normal
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isLarge}
            onClick={() => setScale("large")}
            className={cn(
              "relative z-10 px-3 sm:px-4 py-1.5 text-xs tracking-[0.2em] uppercase rounded-full transition-colors",
              isLarge ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Stor
          </button>
        </div>
      </div>
    </section>
  );
}
