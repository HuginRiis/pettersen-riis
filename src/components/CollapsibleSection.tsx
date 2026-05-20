import { type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { usePerUserPersistedState } from "@/hooks/use-per-user-persisted-state";
import { cn } from "@/lib/utils";

/**
 * Foldbar seksjon som husker åpen/lukket-tilstand per push-bruker (who).
 * Bruk samme stabile `id` på tvers av økter for å beholde tilstanden.
 *
 * Bruk på innstillinger-siden og andre steder vi vil ha kollaps/ekspander.
 */
export function CollapsibleSection({
  id,
  title,
  icon,
  defaultOpen = true,
  className,
  headerClassName,
  contentClassName,
  badge,
  children,
}: {
  id: string;
  title: ReactNode;
  icon?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = usePerUserPersistedState<boolean>(
    `collapsible:${id}`,
    defaultOpen,
  );

  return (
    <div className={cn("panel rounded-lg", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`${id}-content`}
        className={cn(
          "w-full flex items-center justify-between gap-3 px-4 py-3 text-left rounded-lg hover:bg-primary/5 transition-colors",
          headerClassName,
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          {icon}
          <span className="text-sm font-semibold uppercase tracking-wider text-primary truncate">
            {title}
          </span>
          {badge}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open ? "rotate-180" : "",
          )}
        />
      </button>
      {open && (
        <div id={`${id}-content`} className={cn("px-4 pb-4", contentClassName)}>
          {children}
        </div>
      )}
    </div>
  );
}
