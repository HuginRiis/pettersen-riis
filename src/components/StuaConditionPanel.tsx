import type { ReactNode } from "react";

type Verdict = "bra" | "middels" | "darlig";

type Reading = {
  value: number | null;
  verdict: Verdict | "ukjent";
  label: string;
};

function rateTemp(t: number | null): Reading {
  if (t === null) return { value: null, verdict: "ukjent", label: "Ingen avlesning" };
  // Normen: 20–24,8 ideelt, 18–24,8 akseptabelt
  if (t >= 20 && t <= 24.8) return { value: t, verdict: "bra", label: "Mestret av maesteren" };
  if (t >= 18 && t < 20) return { value: t, verdict: "middels", label: "Litt kjølig i salen" };
  if (t > 24.8 && t <= 26) return { value: t, verdict: "middels", label: "Litt vel lummert" };
  if (t < 18) return { value: t, verdict: "darlig", label: "Kalde gufs fra Nord" };
  return { value: t, verdict: "darlig", label: "Drage-hete i salen" };
}

function rateHumidity(h: number | null): Reading {
  if (h === null) return { value: null, verdict: "ukjent", label: "Ingen avlesning" };
  // Normen: 30–60 % ideelt, 20–70 % akseptabelt
  if (h >= 30 && h <= 60) return { value: h, verdict: "bra", label: "Lufta er i balanse" };
  if (h >= 20 && h < 30) return { value: h, verdict: "middels", label: "Tørr som Dorne" };
  if (h > 60 && h <= 70) return { value: h, verdict: "middels", label: "Klam som Sothoryos" };
  if (h < 20) return { value: h, verdict: "darlig", label: "Knusktørr luft" };
  return { value: h, verdict: "darlig", label: "Tåke i borgen" };
}

function rateCo2(c: number | null): Reading {
  if (c === null) return { value: null, verdict: "ukjent", label: "Ingen avlesning" };
  // Normen: <800 bra, 800–1200 middels, >1200 dårlig
  if (c < 800) return { value: c, verdict: "bra", label: "Frisk fjellvind" };
  if (c < 1200) return { value: c, verdict: "middels", label: "Tung luft i salen" };
  return { value: c, verdict: "darlig", label: "Åpne portene — straks!" };
}

const VERDICT_META: Record<Verdict | "ukjent", { sigil: string; tone: string; banner: string; ring: string }> = {
  bra: {
    sigil: "✦",
    tone: "text-emerald-400",
    banner: "Salen er i god stand",
    ring: "ring-emerald-400/40 from-emerald-500/20",
  },
  middels: {
    sigil: "◐",
    tone: "text-amber-300",
    banner: "Maesteren råder til årvåkenhet",
    ring: "ring-amber-400/40 from-amber-500/20",
  },
  darlig: {
    sigil: "✕",
    tone: "text-destructive",
    banner: "Ravner sendes — luft ut salen",
    ring: "ring-destructive/50 from-destructive/20",
  },
  ukjent: {
    sigil: "○",
    tone: "text-muted-foreground",
    banner: "Termometeret tier",
    ring: "ring-border from-muted/20",
  },
};

function overallVerdict(readings: Reading[]): Verdict | "ukjent" {
  const known = readings.filter((r) => r.verdict !== "ukjent");
  if (known.length === 0) return "ukjent";
  if (known.some((r) => r.verdict === "darlig")) return "darlig";
  if (known.some((r) => r.verdict === "middels")) return "middels";
  return "bra";
}

function MetricBlock({
  icon,
  label,
  reading,
  unit,
  digits,
  norm,
}: {
  icon: ReactNode;
  label: string;
  reading: Reading;
  unit: string;
  digits: number;
  norm: string;
}) {
  const meta = VERDICT_META[reading.verdict];
  return (
    <div className={`relative rounded-lg border border-primary/15 bg-background/50 p-4 ring-1 ${meta.ring} bg-gradient-to-br to-transparent`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
            {label}
          </span>
        </div>
        <span className={`text-sm ${meta.tone}`} aria-label={reading.verdict}>
          {meta.sigil}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-display text-3xl ${meta.tone}`}>
          {reading.value !== null ? reading.value.toFixed(digits) : "—"}
        </span>
        <span className="text-xs tracking-[0.2em] uppercase text-muted-foreground">
          {unit}
        </span>
      </div>
      <div className={`text-[10px] tracking-[0.25em] uppercase mt-1 italic ${meta.tone}`}>
        {reading.label}
      </div>
      <div className="text-[9px] tracking-[0.25em] uppercase text-muted-foreground/60 mt-2">
        Norm · {norm}
      </div>
    </div>
  );
}

export function StuaConditionPanel({
  temperature,
  humidity,
  co2,
  sourceName,
}: {
  temperature: number | null;
  humidity: number | null;
  co2: number | null;
  sourceName?: string | null;
}) {
  const tempR = rateTemp(temperature);
  const humR = rateHumidity(humidity);
  const co2R = rateCo2(co2);
  const overall = overallVerdict([tempR, humR, co2R]);
  const meta = VERDICT_META[overall];

  return (
    <section className="container mx-auto px-4 pt-6">
      <div className={`panel rounded-lg p-6 relative overflow-hidden bg-gradient-to-br ${meta.ring} to-transparent`}>
        <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
          <div>
            <div className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase mb-1">
              Maesterens lesning
            </div>
            <h3 className="text-display text-primary text-lg sm:text-xl tracking-[0.25em] uppercase">
              Stuens tilstand
            </h3>
            {sourceName && (
              <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/70 mt-1">
                {sourceName}
              </div>
            )}
          </div>
          <div className={`text-right ${meta.tone}`}>
            <div className="text-3xl">{meta.sigil}</div>
            <div className="text-[10px] tracking-[0.3em] uppercase mt-1">
              {overall === "bra" && "Bra"}
              {overall === "middels" && "Middels"}
              {overall === "darlig" && "Dårlig"}
              {overall === "ukjent" && "Ukjent"}
            </div>
          </div>
        </div>

        <p className={`text-xs italic tracking-[0.15em] mb-5 ${meta.tone}`}>
          « {meta.banner} »
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MetricBlock
            icon="🌡"
            label="Temperatur"
            reading={tempR}
            unit="°C"
            digits={1}
            norm="20–24,8 °C"
          />
          <MetricBlock
            icon="💧"
            label="Hygrostat"
            reading={humR}
            unit="%"
            digits={0}
            norm="30–60 %"
          />
          <MetricBlock
            icon="🜁"
            label="CO₂"
            reading={co2R}
            unit="PPM"
            digits={0}
            norm="< 800 ppm"
          />
        </div>
      </div>
    </section>
  );
}
