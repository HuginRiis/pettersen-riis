import { useEffect, useState } from "react";
import { Cake, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  type Birthday,
  daysUntilBirthday,
  ageAtNextBirthday,
  formatNorwegianDate,
} from "./BirthdaysPanel";

export function BirthdaysOverview() {
  const [items, setItems] = useState<Birthday[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("birthdays" as any)
        .select("id, name, birth_date, title, words, notify_enabled, notify_recipients");
      if (!alive) return;
      if (data) setItems(data as unknown as Birthday[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading || items.length === 0) return null;

  // Skip "today" — those show in BirthdayBanner instead. Sort upcoming.
  const upcoming = items
    .map((b) => ({ b, d: daysUntilBirthday(b.birth_date), a: ageAtNextBirthday(b.birth_date) }))
    .filter(({ d }) => d > 0)
    .sort((x, y) => x.d - y.d);

  if (upcoming.length === 0) return null;

  const visible = expanded ? upcoming : upcoming.slice(0, 3);

  return (
    <section className="container mx-auto px-4 pb-10">
      <div className="ornate-divider mb-6">
        <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
          Kommende bursdager
        </span>
      </div>
      <ul className="max-w-2xl mx-auto space-y-2">
        {visible.map(({ b, d, a }) => (
          <li
            key={b.id}
            className="panel rounded p-3 flex items-center gap-3"
          >
            <div className="shrink-0 w-10 h-10 rounded-full bg-accent/30 flex items-center justify-center text-primary">
              <Cake size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-foreground font-semibold">{b.name}</span>
                {b.title && (
                  <span className="text-[11px] text-primary/80">{b.title}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatNorwegianDate(b.birth_date)} • Fyller {a} år
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-primary text-lg font-bold tabular-nums leading-none">
                {d}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {d === 1 ? "dag" : "dager"}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {upcoming.length > 3 && (
        <div className="text-center mt-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-primary hover:opacity-80 transition"
          >
            {expanded ? (
              <>
                Vis færre <ChevronUp size={14} />
              </>
            ) : (
              <>
                Vis alle ({upcoming.length}) <ChevronDown size={14} />
              </>
            )}
          </button>
        </div>
      )}
    </section>
  );
}
