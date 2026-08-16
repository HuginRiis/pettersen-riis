import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Atom, Wind, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { getRadonStatus, type RadonDevice, type RadonSample } from "@/lib/radon.functions";
import { getVocStatus, type VocDevice } from "@/lib/voc.functions";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

type Sample = { t: string; v: number };

/* ---------- nivåer ---------- */

const RADON_LIMITS = [
  { v: 100, label: "Tiltaksgrense 100", color: "#fbbf24" },
  { v: 200, label: "Grenseverdi 200", color: "#fb923c" },
  { v: 300, label: "Tiltak påkrevd 300", color: "#f87171" },
];

function radonColor(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "#a3a3a3";
  if (v < 100) return "#34d399";
  if (v < 200) return "#fbbf24";
  if (v < 300) return "#fb923c";
  return "#f87171";
}
function radonLabel(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "Ukjent";
  if (v < 100) return "Bra";
  if (v < 200) return "Forhøyet";
  if (v < 300) return "Høyt";
  return "Tiltak påkrevd";
}

const VOC_LIMITS = [
  { v: 250, label: "God luft 250", color: "#fbbf24" },
  { v: 1000, label: "Dårlig 1000", color: "#fb923c" },
  { v: 3000, label: "Luft ut! 3000", color: "#f87171" },
];
function vocColor(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "#a3a3a3";
  if (v < 250) return "#34d399";
  if (v < 1000) return "#fbbf24";
  if (v < 3000) return "#fb923c";
  return "#f87171";
}
function vocLabel(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "Ukjent";
  if (v < 250) return "Bra";
  if (v < 1000) return "Middels";
  if (v < 3000) return "Dårlig";
  return "Svært dårlig";
}

/* ---------- statistikk ---------- */

function clean(list: Sample[] | undefined): Sample[] {
  return (list ?? []).filter((p) => Number.isFinite(p.v));
}
function mean(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
function trendOf(daily: Sample[]): { pct: number | null; recent: number | null; prev: number | null } {
  const pts = clean(daily);
  if (pts.length < 4) return { pct: null, recent: null, prev: null };
  const half = Math.floor(pts.length / 2);
  const prev = mean(pts.slice(0, half).map((p) => p.v));
  const recent = mean(pts.slice(half).map((p) => p.v));
  if (prev == null || recent == null || prev === 0) return { pct: null, recent, prev };
  return { pct: ((recent - prev) / prev) * 100, recent, prev };
}
// Døgnprofil: snitt per klokketime av hourly48
function hourProfile(hourly: Sample[]): { hour: number; v: number }[] {
  const buckets = new Map<number, { s: number; n: number }>();
  for (const p of clean(hourly)) {
    const h = new Date(p.t).getHours();
    const b = buckets.get(h) ?? { s: 0, n: 0 };
    b.s += p.v;
    b.n += 1;
    buckets.set(h, b);
  }
  const out: { hour: number; v: number }[] = [];
  for (let h = 0; h < 24; h++) {
    const b = buckets.get(h);
    if (b) out.push({ hour: h, v: b.s / b.n });
  }
  return out;
}
// Grov «langtidsverdi» (årsmiddel-estimat) fra tilgjengelig historikk
function longTerm(daily: Sample[], avg30: number | null): number | null {
  const d = clean(daily).map((p) => p.v);
  return mean(d) ?? avg30 ?? null;
}

const nf = (v: number | null | undefined, d = 0) =>
  v == null || !Number.isFinite(v) ? "—" : v.toFixed(d);

/* ---------- delkomponenter ---------- */

function StatBox({
  label,
  value,
  unit,
  color,
  sub,
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-display text-2xl tabular-nums" style={{ color: color ?? undefined }}>
          {value}
        </span>
        {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct == null)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Minus size={12} /> for lite data
      </span>
    );
  const up = pct > 3;
  const down = pct < -3;
  const color = up ? "#fb923c" : down ? "#34d399" : "#94a3b8";
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border"
      style={{ color, borderColor: color + "66", background: color + "18" }}
    >
      <Icon size={12} />
      {pct > 0 ? "+" : ""}
      {pct.toFixed(0)} % siste uke vs forrige
    </span>
  );
}

function SeriesChart({
  data,
  color,
  limits,
  unit,
  xFormat,
  height = 170,
}: {
  data: Sample[];
  color: string;
  limits: { v: number; label: string; color: string }[];
  unit: string;
  xFormat: (t: string) => string;
  height?: number;
}) {
  const rows = clean(data).map((p) => ({ t: p.t, v: Math.round(p.v * 10) / 10 }));
  if (!rows.length)
    return <p className="text-xs text-muted-foreground italic py-6">Ingen historikk tilgjengelig.</p>;
  const max = Math.max(...rows.map((r) => r.v));
  const shown = limits.filter((l) => l.v <= max * 1.6);
  const id = `g-${color.replace("#", "")}-${rows.length}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.55} />
            <stop offset="100%" stopColor={color} stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} />
        <XAxis
          dataKey="t"
          tickFormatter={xFormat}
          tick={{ fontSize: 10 }}
          stroke="currentColor"
          opacity={0.6}
          minTickGap={24}
        />
        <YAxis tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.6} width={40} />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelFormatter={(t) => xFormat(String(t))}
          formatter={(v: any) => [`${v} ${unit}`, "Verdi"]}
        />
        {shown.map((l) => (
          <ReferenceLine
            key={l.v}
            y={l.v}
            stroke={l.color}
            strokeDasharray="4 4"
            label={{ value: l.label, position: "insideTopLeft", fontSize: 9, fill: l.color }}
          />
        ))}
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ProfileChart({
  profile,
  colorOf,
  unit,
}: {
  profile: { hour: number; v: number }[];
  colorOf: (v: number) => string;
  unit: string;
}) {
  if (!profile.length)
    return <p className="text-xs text-muted-foreground italic py-6">Ingen døgnprofil ennå.</p>;
  const rows = profile.map((p) => ({ h: `${String(p.hour).padStart(2, "0")}`, v: Math.round(p.v) }));
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={rows} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} />
        <XAxis dataKey="h" tick={{ fontSize: 9 }} stroke="currentColor" opacity={0.6} interval={1} />
        <YAxis tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.6} width={40} />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelFormatter={(h) => `Kl. ${h}:00`}
          formatter={(v: any) => [`${v} ${unit}`, "Snitt"]}
        />
        <Bar dataKey="v" radius={[3, 3, 0, 0]}>
          {rows.map((r, i) => (
            <Cell key={i} fill={colorOf(r.v)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ---------- måler-kort ---------- */

function MeterCard({
  kind,
  title,
  current,
  unit,
  lastUpdated,
  min30,
  max30,
  avg30,
  hourly48,
  daily14,
}: {
  kind: "radon" | "voc";
  title: string;
  current: number | null;
  unit: string;
  lastUpdated: string | null;
  min30: number | null;
  max30: number | null;
  avg30: number | null;
  hourly48: Sample[];
  daily14: Sample[];
}) {
  const colorOf = kind === "radon" ? radonColor : vocColor;
  const labelOf = kind === "radon" ? radonLabel : vocLabel;
  const limits = kind === "radon" ? RADON_LIMITS : VOC_LIMITS;
  const color = colorOf(current);
  const trend = trendOf(daily14);
  const lt = longTerm(daily14, avg30);
  const profile = hourProfile(hourly48);
  const worst = profile.length ? profile.reduce((a, b) => (b.v > a.v ? b : a)) : null;
  const best = profile.length ? profile.reduce((a, b) => (b.v < a.v ? b : a)) : null;
  const overLimit =
    kind === "radon"
      ? clean(daily14).filter((p) => p.v >= 100).length
      : clean(daily14).filter((p) => p.v >= 1000).length;
  const pctOfLimit =
    lt != null ? (lt / (kind === "radon" ? 100 : 1000)) * 100 : null;

  const Icon = kind === "radon" ? Atom : Wind;

  return (
    <article className="panel rounded-lg p-5 space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon size={16} style={{ color }} />
          <div>
            <h4 className="text-display text-base tracking-wider uppercase text-foreground">{title}</h4>
            <p className="text-[10px] text-muted-foreground">
              {kind === "radon" ? "Radon · Bq/m³" : "VOC · flyktige organiske gasser"}
            </p>
          </div>
        </div>
        <span
          className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border whitespace-nowrap"
          style={{ color, borderColor: color + "66", background: color + "18" }}
        >
          {labelOf(current)}
        </span>
      </header>

      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-display text-5xl tabular-nums" style={{ color }}>
            {nf(current)}
          </span>
          <span className="text-xs text-muted-foreground">{unit}</span>
        </div>
        <TrendBadge pct={trend.pct} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatBox label="Langtid" value={nf(lt)} unit={unit} color={colorOf(lt)} sub="snitt av historikk" />
        <StatBox label="Snitt 30 d" value={nf(avg30)} unit={unit} color={colorOf(avg30)} />
        <StatBox label="Min 30 d" value={nf(min30)} unit={unit} color={colorOf(min30)} />
        <StatBox label="Maks 30 d" value={nf(max30)} unit={unit} color={colorOf(max30)} />
      </div>

      {/* Andel av tiltaksgrense */}
      <div>
        <div className="flex justify-between text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
          <span>Langtid mot {kind === "radon" ? "tiltaksgrense 100 Bq/m³" : "grense 1000 ppb"}</span>
          <span className="tabular-nums">{pctOfLimit == null ? "—" : `${pctOfLimit.toFixed(0)} %`}</span>
        </div>
        <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, pctOfLimit ?? 0)}%`,
              background: colorOf(lt),
              boxShadow: `0 0 10px ${colorOf(lt)}`,
            }}
          />
        </div>
      </div>

      <div>
        <h5 className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-1">
          Siste 48 timer
        </h5>
        <SeriesChart
          data={hourly48}
          color={color}
          limits={limits}
          unit={unit}
          xFormat={(t) =>
            new Date(t).toLocaleString("nb-NO", { weekday: "short", hour: "2-digit" })
          }
        />
      </div>

      <div>
        <h5 className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-1">
          Døgnsnitt siste 14 dager
        </h5>
        <SeriesChart
          data={daily14}
          color={color}
          limits={limits}
          unit={unit}
          height={150}
          xFormat={(t) => new Date(t).toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit" })}
        />
      </div>

      <div>
        <h5 className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-1">
          Døgnprofil (snitt per klokketime)
        </h5>
        <ProfileChart profile={profile} colorOf={colorOf} unit={unit} />
        <p className="text-[11px] text-muted-foreground mt-1">
          {worst && best
            ? `Høyest rundt kl. ${String(worst.hour).padStart(2, "0")}:00 (${nf(worst.v)} ${unit}), lavest rundt kl. ${String(
                best.hour,
              ).padStart(2, "0")}:00 (${nf(best.v)} ${unit}).`
            : "Bygger opp døgnprofil."}
        </p>
      </div>

      <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 border-t border-border/50 pt-2">
        <span>
          Dager over {kind === "radon" ? "100 Bq/m³" : "1000 ppb"}: <b className="tabular-nums">{overLimit}</b> av{" "}
          {clean(daily14).length}
        </span>
        <span>
          Sensor oppdatert:{" "}
          {lastUpdated
            ? new Date(lastUpdated).toLocaleString("nb-NO", {
                weekday: "short",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
        </span>
      </div>
    </article>
  );
}

/* ---------- sammenligning kjeller vs stue ---------- */

function CompareChart({
  a,
  b,
  labelA,
  labelB,
  unit,
}: {
  a: Sample[];
  b: Sample[];
  labelA: string;
  labelB: string;
  unit: string;
}) {
  const map = new Map<string, { t: string; a?: number; b?: number }>();
  for (const p of clean(a)) map.set(p.t.slice(0, 10), { t: p.t.slice(0, 10), a: Math.round(p.v) });
  for (const p of clean(b)) {
    const k = p.t.slice(0, 10);
    map.set(k, { ...(map.get(k) ?? { t: k }), b: Math.round(p.v) });
  }
  const rows = [...map.values()].sort((x, y) => x.t.localeCompare(y.t));
  if (!rows.length)
    return <p className="text-xs text-muted-foreground italic py-6">Ingen felles historikk.</p>;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={rows} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="cmpA" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.03} />
          </linearGradient>
          <linearGradient id="cmpB" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f472b6" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#f472b6" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} />
        <XAxis
          dataKey="t"
          tick={{ fontSize: 10 }}
          stroke="currentColor"
          opacity={0.6}
          tickFormatter={(t) => new Date(t).toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit" })}
        />
        <YAxis tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.6} width={40} />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(v: any, n: any) => [`${v} ${unit}`, n === "a" ? labelA : labelB]}
        />
        <Area type="monotone" dataKey="a" stroke="#38bdf8" strokeWidth={2} fill="url(#cmpA)" />
        <Area type="monotone" dataKey="b" stroke="#f472b6" strokeWidth={2} fill="url(#cmpB)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ---------- hovedseksjon ---------- */

function zoneKey(name: string): "kjeller" | "stue" | "annet" {
  const n = name.toLowerCase();
  if (n.includes("kjeller") || n.includes("soverom")) return "kjeller";
  if (n.includes("stu")) return "stue";
  return "annet";
}

export function IndoorAirSection() {
  const fetchRadon = useServerFn(getRadonStatus);
  const fetchVoc = useServerFn(getVocStatus);
  const [radon, setRadon] = useState<{ loading: boolean; error: string | null; devices: RadonDevice[] }>({
    loading: true,
    error: null,
    devices: [],
  });
  const [voc, setVoc] = useState<{ loading: boolean; error: string | null; devices: VocDevice[] }>({
    loading: true,
    error: null,
    devices: [],
  });

  useEffect(() => {
    let cancelled = false;
    fetchRadon()
      .then((r) => !cancelled && setRadon({ loading: false, error: r.ok ? null : r.error ?? "Ukjent feil", devices: r.devices }))
      .catch((e) => !cancelled && setRadon({ loading: false, error: String(e?.message ?? e), devices: [] }));
    fetchVoc()
      .then((r) => !cancelled && setVoc({ loading: false, error: r.ok ? null : r.error ?? "Ukjent feil", devices: r.devices }))
      .catch((e) => !cancelled && setVoc({ loading: false, error: String(e?.message ?? e), devices: [] }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const radonSorted = useMemo(() => {
    const rank = (d: RadonDevice) => {
      const k = zoneKey(d.zone ?? d.name);
      return k === "kjeller" ? 0 : k === "stue" ? 1 : 2;
    };
    return [...radon.devices].sort((a, b) => rank(a) - rank(b));
  }, [radon.devices]);

  const kjeller = radonSorted.find((d) => zoneKey(d.zone ?? d.name) === "kjeller");
  const stue = radonSorted.find((d) => zoneKey(d.zone ?? d.name) === "stue");

  const loading = radon.loading || voc.loading;

  return (
    <div className="space-y-6">
      <p className="max-w-3xl mx-auto text-center text-xs text-muted-foreground leading-relaxed">
        Innendørs luft fra Airthings-målerne i huset: radon i både kjeller og stue, samt VOC
        (flyktige organiske gasser). Langtidsverdier sammenlignes med Helsedirektoratets
        tiltaksgrense (100 Bq/m³) og grenseverdi (200 Bq/m³) — kurvene viser time-for-time,
        døgnsnitt, døgnprofil og trend.
      </p>

      {loading && <p className="text-sm text-muted-foreground italic text-center">Henter innemålinger…</p>}
      {!loading && radon.error && (
        <p className="text-sm text-destructive text-center">Radon: {radon.error}</p>
      )}

      {radonSorted.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-6">
          {radonSorted.map((d) => (
            <MeterCard
              key={d.deviceId}
              kind="radon"
              title={`Radon · ${zoneKey(d.zone ?? d.name) === "kjeller" ? "Kjeller" : zoneKey(d.zone ?? d.name) === "stue" ? "Stue" : (d.zone ?? d.name)}`}
              current={d.current}
              unit={d.unit || "Bq/m³"}
              lastUpdated={d.lastUpdated}
              min30={d.min30}
              max30={d.max30}
              avg30={d.avg30}
              hourly48={d.hourly48 as RadonSample[]}
              daily14={d.daily14 as RadonSample[]}
            />
          ))}
        </div>
      )}

      {kjeller && stue && (
        <article className="panel rounded-lg p-5">
          <h4 className="text-display text-base tracking-wider uppercase text-foreground mb-1">
            Kjeller vs stue — døgnsnitt radon
          </h4>
          <p className="text-[11px] text-muted-foreground mb-3">
            <span style={{ color: "#38bdf8" }}>■</span> Kjeller ·{" "}
            <span style={{ color: "#f472b6" }}>■</span> Stue. Kjelleren ligger normalt høyest fordi
            radon siver inn fra grunnen.
          </p>
          <CompareChart
            a={kjeller.daily14}
            b={stue.daily14}
            labelA="Kjeller"
            labelB="Stue"
            unit="Bq/m³"
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
            <StatBox
              label="Forskjell nå"
              value={
                kjeller.current != null && stue.current != null
                  ? nf(kjeller.current - stue.current)
                  : "—"
              }
              unit="Bq/m³"
              sub="kjeller − stue"
            />
            <StatBox
              label="Langtid kjeller"
              value={nf(longTerm(kjeller.daily14, kjeller.avg30))}
              unit="Bq/m³"
              color={radonColor(longTerm(kjeller.daily14, kjeller.avg30))}
            />
            <StatBox
              label="Langtid stue"
              value={nf(longTerm(stue.daily14, stue.avg30))}
              unit="Bq/m³"
              color={radonColor(longTerm(stue.daily14, stue.avg30))}
            />
          </div>
        </article>
      )}

      {voc.devices.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-6">
          {voc.devices.map((d) => (
            <MeterCard
              key={d.deviceId}
              kind="voc"
              title={`VOC · ${d.zone ?? d.name}`}
              current={d.current}
              unit={d.unit || "ppb"}
              lastUpdated={d.lastUpdated}
              min30={d.min30}
              max30={d.max30}
              avg30={d.avg30}
              hourly48={d.hourly48}
              daily14={d.daily14}
            />
          ))}
        </div>
      )}

      {!loading && radonSorted.length === 0 && voc.devices.length === 0 && (
        <p className="text-sm text-muted-foreground italic text-center">
          Fant ingen radon- eller VOC-målere fra Homey akkurat nå.
        </p>
      )}

      <div className="panel rounded-lg p-4 text-[11px] text-muted-foreground leading-relaxed">
        <b className="text-foreground">Slik leser du tallene:</b> Radon måles i becquerel per
        kubikkmeter (Bq/m³). Årsmiddelverdien bør være under 100 Bq/m³ (tiltaksgrense), og skal
        aldri overstige 200 Bq/m³ (grenseverdi). Enkelttimer kan svinge mye — det er langtidsnivået
        som betyr noe for helsa. VOC måles i ppb: under 250 er bra, 250–1000 middels, over 1000 bør
        du lufte, og over 3000 er svært dårlig.
      </div>
    </div>
  );
}
