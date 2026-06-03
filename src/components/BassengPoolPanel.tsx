import { Waves } from "lucide-react";

type Verdict = "kald" | "frisk" | "perfekt" | "varm";

function classify(t: number | null): { verdict: Verdict | "ukjent"; tone: string; ring: string; banner: string; sigil: string } {
  if (t === null) return { verdict: "ukjent", tone: "text-muted-foreground", ring: "from-muted/20 ring-border", banner: "Termometeret tier i dypet", sigil: "○" };
  if (t < 20) return { verdict: "kald", tone: "text-sky-300", ring: "from-sky-500/25 ring-sky-400/40", banner: "Iskaldt som Veggen — kun for de modige", sigil: "❄" };
  if (t < 25) return { verdict: "frisk", tone: "text-amber-300", ring: "from-amber-500/25 ring-amber-400/40", banner: "Friskt, men ikke uten gys", sigil: "◐" };
  if (t <= 35) return { verdict: "perfekt", tone: "text-emerald-400", ring: "from-emerald-500/25 ring-emerald-400/40", banner: "Vannet hilser deg velkommen, min herre", sigil: "✦" };
  return { verdict: "varm", tone: "text-orange-400", ring: "from-orange-500/25 ring-orange-400/40", banner: "Som drage-bad — pass på huden", sigil: "♨" };
}

const MIN = 10;
const MAX = 40;

export function BassengPoolPanel({
  title = "🏊 Bassengets vannspeil",
  temperature,
  sourceName,
  inline = false,
}: {
  title?: string;
  temperature: number | null;
  sourceName?: string | null;
  inline?: boolean;
}) {
  const meta = classify(temperature);
  const pct = temperature == null ? 0 : Math.max(0, Math.min(100, ((temperature - MIN) / (MAX - MIN)) * 100));

  const inner = (
      <div className={`panel rounded-lg p-4 sm:p-6 relative overflow-hidden bg-gradient-to-br ${meta.ring} to-transparent h-full`}>

        <div className="flex items-start justify-between gap-3 mb-4 sm:mb-5 flex-wrap">
          <div className="min-w-0">
            <div className="text-[9px] sm:text-[10px] tracking-[0.25em] sm:tracking-[0.3em] text-muted-foreground uppercase mb-0.5 sm:mb-1">
              Maesterens lodd i vannet
            </div>
            <h3 className="text-display text-primary text-sm sm:text-xl tracking-[0.2em] sm:tracking-[0.25em] uppercase flex items-center gap-2">
              <Waves size={16} className="text-[var(--gold)]" />
              {title}
            </h3>
            {sourceName && (
              <div className="hidden sm:block text-[10px] tracking-[0.25em] uppercase text-muted-foreground/70 mt-1">
                {sourceName}
              </div>
            )}
          </div>
          <div className={`text-right ${meta.tone}`}>
            <div className="text-2xl sm:text-3xl">{meta.sigil}</div>
            <div className="text-[9px] sm:text-[10px] tracking-[0.25em] uppercase mt-0.5 sm:mt-1">
              {meta.verdict === "perfekt" && "Perfekt"}
              {meta.verdict === "frisk" && "Friskt"}
              {meta.verdict === "kald" && "Iskaldt"}
              {meta.verdict === "varm" && "Lummert"}
              {meta.verdict === "ukjent" && "Ukjent"}
            </div>
          </div>
        </div>

        <div className="flex items-baseline gap-3 mb-4">
          <span className={`text-display text-5xl sm:text-7xl ${meta.tone} leading-none tabular-nums`}>
            {temperature !== null ? temperature.toFixed(1) : "—"}
          </span>
          <span className="text-sm sm:text-base tracking-[0.2em] uppercase text-muted-foreground">°C</span>
        </div>

        <p className={`text-xs sm:text-sm italic tracking-[0.1em] mb-5 ${meta.tone}`}>
          « {meta.banner} »
        </p>

        {/* Meter / vannspeil */}
        <div className="relative h-6 rounded-full overflow-hidden border border-border/60 bg-background/40">
          <div
            className="absolute inset-y-0 left-0"
            style={{
              width: "100%",
              background:
                "linear-gradient(to right, hsl(200 85% 65%) 0%, hsl(200 85% 65%) 33%, hsl(45 90% 55%) 33%, hsl(45 90% 55%) 50%, hsl(150 65% 45%) 50%, hsl(150 65% 45%) 100%)",
              opacity: 0.28,
            }}
          />
          {temperature !== null && (
            <div
              className="absolute top-0 bottom-0 w-[3px] bg-foreground shadow-[0_0_8px_rgba(255,255,255,0.6)]"
              style={{ left: `calc(${pct}% - 1.5px)` }}
              aria-hidden
            />
          )}
        </div>
        <div className="flex justify-between text-[9px] sm:text-[10px] tracking-[0.2em] uppercase text-muted-foreground mt-2 tabular-nums">
          <span>{MIN}°</span>
          <span className="text-sky-300/80">&lt; 20° Iskaldt</span>
          <span className="text-amber-300/80">20–25° Friskt</span>
          <span className="text-emerald-400/80">25–35° Perfekt</span>
          <span>{MAX}°</span>
        </div>
      </div>
    </section>
  );
}
