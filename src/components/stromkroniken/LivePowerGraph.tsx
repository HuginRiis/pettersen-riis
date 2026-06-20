import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { Crown, Flame, Eye, EyeOff } from "lucide-react";
import { getPulseHistory, type PulseHistoryPoint } from "@/lib/pulse-readings";
import { useTibberLive } from "@/hooks/useTibberLive";

type RangeKey = "24t" | "6t" | "1t" | "5min";
const RANGES: { key: RangeKey; label: string; hours: number; tickFmt: Intl.DateTimeFormatOptions }[] = [
  { key: "24t", label: "24 t", hours: 24, tickFmt: { hour: "2-digit", minute: "2-digit" } },
  { key: "6t", label: "6 t", hours: 6, tickFmt: { hour: "2-digit", minute: "2-digit" } },
  { key: "1t", label: "1 t", hours: 1, tickFmt: { hour: "2-digit", minute: "2-digit" } },
  { key: "5min", label: "5 min", hours: 5 / 60, tickFmt: { hour: "2-digit", minute: "2-digit" } },
];

const COLOR_BORGEN = "#a68b3a"; // dempet gull mot svart
const COLOR_HYTTA = "#4a9e9a"; // dempet ice-teal mot svart
const COLOR_TOTAL = "#8b6d3e"; // bronse/sammensatt
const STROKE_GRID = "#2a2218";

type Row = { t: number; borgen: number | null; hytta: number | null; samlet: number | null };

function fmtTime(ts: number, opts: Intl.DateTimeFormatOptions) {
  return new Date(ts).toLocaleTimeString("nb-NO", { timeZone: "Europe/Oslo", ...opts });
}

function mergeSeries(borgen: PulseHistoryPoint[], hytta: PulseHistoryPoint[]): Row[] {
  const map = new Map<number, Row>();
  for (const p of borgen) {
    if (p.watt == null) continue;
    const t = new Date(p.t).getTime();
    const cur = map.get(t) ?? { t, borgen: null, hytta: null, samlet: null };
    cur.borgen = p.watt;
    map.set(t, cur);
  }
  for (const p of hytta) {
    if (p.watt == null) continue;
    const t = new Date(p.t).getTime();
    const cur = map.get(t) ?? { t, borgen: null, hytta: null, samlet: null };
    cur.hytta = p.watt;
    map.set(t, cur);
  }
  // Beregn samlet der begge finnes
  for (const row of map.values()) {
    if (row.borgen != null && row.hytta != null) {
      row.samlet = row.borgen + row.hytta;
    } else if (row.borgen != null) {
      row.samlet = row.borgen;
    } else if (row.hytta != null) {
      row.samlet = row.hytta;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.t - b.t);
}

export function LivePowerGraph() {
  const fetchHistory = useServerFn(getPulseHistory);
  const live = useTibberLive();
  const [range, setRange] = useState<RangeKey>("6t");
  const [borgen, setBorgen] = useState<PulseHistoryPoint[]>([]);
  const [hytta, setHytta] = useState<PulseHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Toggles for hver serie
  const [showBorgen, setShowBorgen] = useState(true);
  const [showHytta, setShowHytta] = useState(true);
  const [showTotal, setShowTotal] = useState(false);

  const hours = RANGES.find((r) => r.key === range)!.hours;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchHistory({ data: { location: "tollnes", hours } }),
      fetchHistory({ data: { location: "hytta", hours } }),
    ])
      .then(([b, h]) => {
        if (cancelled) return;
        setBorgen(b.points);
        setHytta(h.points);
      })
      .catch((err) => console.error("[LivePowerGraph]", err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchHistory, hours]);

  // Inject live readings as the most recent point so the line tracks sanntid
  const data = useMemo(() => {
    const rows = mergeSeries(borgen, hytta);
    const now = Date.now();
    const liveRow: Row = { t: now, borgen: null, hytta: null, samlet: null };
    const lb = live.homes.tollnes.reading?.power;
    const lh = live.homes.hytta.reading?.power;
    if (typeof lb === "number") liveRow.borgen = Math.round(lb);
    if (typeof lh === "number") liveRow.hytta = Math.round(lh);
    if (liveRow.borgen != null || liveRow.hytta != null) {
      if (liveRow.borgen != null && liveRow.hytta != null) {
        liveRow.samlet = liveRow.borgen + liveRow.hytta;
      } else if (liveRow.borgen != null) {
        liveRow.samlet = liveRow.borgen;
      } else {
        liveRow.samlet = liveRow.hytta!;
      }
      rows.push(liveRow);
    }
    // Filter to window
    const since = now - hours * 3600 * 1000;
    return rows.filter((r) => r.t >= since);
  }, [borgen, hytta, hours, live]);

  const liveBorgen = live.homes.tollnes.reading?.power ?? null;
  const liveHytta = live.homes.hytta.reading?.power ?? null;
  const totalNow =
    (typeof liveBorgen === "number" ? liveBorgen : 0) +
    (typeof liveHytta === "number" ? liveHytta : 0);

  const tickFmt = RANGES.find((r) => r.key === range)!.tickFmt;

  return (
    <article
      className="rounded-lg p-5 sm:p-6 border space-y-4"
      style={{
        background:
          "radial-gradient(circle at 20% 0%, rgba(166,139,58,0.06), transparent 60%), linear-gradient(180deg, #0a0804 0%, #0e0a05 100%)",
        borderColor: "rgba(166,139,58,0.28)",
        boxShadow: "0 12px 40px -16px rgba(166,139,58,0.2), inset 0 0 0 1px rgba(166,139,58,0.04)",
      }}
    >
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div
            className="text-[10px] tracking-[0.42em] uppercase"
            style={{ color: COLOR_BORGEN, fontFamily: "Cinzel, 'Cormorant Garamond', serif" }}
          >
            Sanntids Krønike
          </div>
          <h2
            className="text-2xl sm:text-3xl mt-1 flex items-center gap-2"
            style={{ color: "#e8d9b0", fontFamily: "Cinzel, 'Cormorant Garamond', serif", letterSpacing: "0.04em" }}
          >
            <Crown size={22} style={{ color: COLOR_BORGEN }} /> Forbruk nå
          </h2>
          <p className="text-xs mt-1" style={{ color: "rgba(232,217,176,0.5)" }}>
            Borgen og Hytta — strømmens puls i sanntid
          </p>
        </div>
        <div className="text-right">
          <div
            className="text-3xl sm:text-4xl tabular-nums"
            style={{ color: "#e8d9b0", fontFamily: "Cinzel, serif" }}
          >
            {Math.round(totalNow).toLocaleString("nb-NO")} <span className="text-base opacity-70">W</span>
          </div>
          <div className="text-[10px] tracking-[0.3em] uppercase mt-1 flex items-center gap-1.5 justify-end" style={{ color: COLOR_BORGEN }}>
            <Flame size={11} /> Samlet effekt
          </div>
        </div>
      </header>

      {/* Toggle-rad for serier */}
      <div className="flex flex-wrap gap-2">
        <SeriesToggle
          active={showBorgen}
          onClick={() => setShowBorgen((v) => !v)}
          label="Borgen"
          color={COLOR_BORGEN}
        />
        <SeriesToggle
          active={showHytta}
          onClick={() => setShowHytta((v) => !v)}
          label="Hytta"
          color={COLOR_HYTTA}
        />
        <SeriesToggle
          active={showTotal}
          onClick={() => setShowTotal((v) => !v)}
          label="Samlet"
          color={COLOR_TOTAL}
        />
      </div>

      {/* Live legend with current watts per home */}
      <div className="flex flex-wrap gap-4 text-xs">
        {showBorgen && <LiveDot color={COLOR_BORGEN} label="Borgen" watt={liveBorgen} />}
        {showHytta && <LiveDot color={COLOR_HYTTA} label="Hytta" watt={liveHytta} />}
        {showTotal && <LiveDot color={COLOR_TOTAL} label="Samlet" watt={totalNow > 0 ? totalNow : null} />}
      </div>

      <div className="h-72 w-full">
        {loading && data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs" style={{ color: "rgba(232,217,176,0.4)" }}>
            Spør ravnene om effekten…
          </div>
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs" style={{ color: "rgba(232,217,176,0.4)" }}>
            Ingen avlesninger i valgt vindu.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="grad-borgen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLOR_BORGEN} stopOpacity={0.5} />
                  <stop offset="60%" stopColor={COLOR_BORGEN} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={COLOR_BORGEN} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="grad-hytta" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLOR_HYTTA} stopOpacity={0.45} />
                  <stop offset="60%" stopColor={COLOR_HYTTA} stopOpacity={0.12} />
                  <stop offset="100%" stopColor={COLOR_HYTTA} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="grad-samlet" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLOR_TOTAL} stopOpacity={0.35} />
                  <stop offset="60%" stopColor={COLOR_TOTAL} stopOpacity={0.08} />
                  <stop offset="100%" stopColor={COLOR_TOTAL} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={STROKE_GRID} strokeDasharray="3 5" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tick={{ fill: "rgba(232,217,176,0.45)", fontSize: 10, fontFamily: "Cinzel, serif" }}
                tickFormatter={(v) => fmtTime(v, tickFmt)}
                stroke={STROKE_GRID}
                minTickGap={40}
              />
              <YAxis
                tick={{ fill: "rgba(232,217,176,0.45)", fontSize: 10, fontFamily: "Cinzel, serif" }}
                stroke={STROKE_GRID}
                width={52}
                tickFormatter={(v) => `${Math.round(v / 100) / 10}k`}
                unit=" W"
              />
              <Tooltip
                contentStyle={{
                  background: "#0a0804",
                  border: `1px solid ${COLOR_BORGEN}`,
                  borderRadius: 4,
                  fontFamily: "Cinzel, serif",
                  color: "#e8d9b0",
                  fontSize: 12,
                }}
                labelFormatter={(v) => `Kl. ${fmtTime(Number(v), { hour: "2-digit", minute: "2-digit" })}`}
                formatter={(val: number, name: string) => [
                  `${Math.round(val).toLocaleString("nb-NO")} W`,
                  name,
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: "#e8d9b0", fontFamily: "Cinzel, serif", letterSpacing: "0.15em", textTransform: "uppercase" }}
                iconType="plainline"
              />
              {showBorgen && (
                <Area
                  type="monotone"
                  dataKey="borgen"
                  name="Borgen"
                  stroke={COLOR_BORGEN}
                  strokeWidth={2}
                  fill="url(#grad-borgen)"
                  connectNulls
                  isAnimationActive={false}
                  dot={false}
                />
              )}
              {showHytta && (
                <Area
                  type="monotone"
                  dataKey="hytta"
                  name="Hytta"
                  stroke={COLOR_HYTTA}
                  strokeWidth={2}
                  fill="url(#grad-hytta)"
                  connectNulls
                  isAnimationActive={false}
                  dot={false}
                />
              )}
              {showTotal && (
                <Area
                  type="monotone"
                  dataKey="samlet"
                  name="Samlet"
                  stroke={COLOR_TOTAL}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  fill="url(#grad-samlet)"
                  connectNulls
                  isAnimationActive={false}
                  dot={false}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex justify-center gap-2 flex-wrap">
        {RANGES.map((r) => {
          const active = r.key === range;
          return (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className="px-5 py-1.5 rounded-full text-xs tracking-[0.3em] uppercase transition"
              style={{
                fontFamily: "Cinzel, serif",
                background: active ? COLOR_BORGEN : "transparent",
                color: active ? "#0a0804" : "rgba(232,217,176,0.6)",
                border: `1px solid ${active ? COLOR_BORGEN : "rgba(166,139,58,0.3)"}`,
                boxShadow: active ? "0 0 18px -2px rgba(166,139,58,0.5)" : "none",
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>
    </article>
  );
}

function SeriesToggle({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color: string;
}) {
  const Icon = active ? Eye : EyeOff;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] tracking-[0.2em] uppercase transition select-none"
      style={{
        fontFamily: "Cinzel, serif",
        background: active ? `${color}15` : "transparent",
        color: active ? color : "rgba(232,217,176,0.4)",
        border: `1px solid ${active ? color : "rgba(232,217,176,0.15)"}`,
        boxShadow: active ? `0 0 10px -2px ${color}40` : "none",
      }}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

function LiveDot({ color, label, watt }: { color: string; label: string; watt: number | null }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 10px ${color}` }}
      />
      <span
        className="tracking-[0.2em] uppercase text-[10px]"
        style={{ color: "rgba(232,217,176,0.65)", fontFamily: "Cinzel, serif" }}
      >
        {label}
      </span>
      <span className="tabular-nums" style={{ color, fontFamily: "Cinzel, serif" }}>
        {watt != null ? `${Math.round(watt).toLocaleString("nb-NO")} W` : "—"}
      </span>
    </div>
  );
}
