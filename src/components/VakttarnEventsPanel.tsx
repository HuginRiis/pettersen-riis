import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { fetchVakttarnEvents, type VakttarnStats } from "@/server/vakttarn-events.functions";
import { Users, PawPrint, Car, Bell, Eye, Calendar } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

type Range = "day" | "week" | "month";

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const CATS = [
  { key: "person", label: "Sjeler", icon: Users, color: "#d4af37", desc: "Mennesker observert ved porten" },
  { key: "dyr", label: "Dyr", icon: PawPrint, color: "#7fb069", desc: "Ulver, hunder og andre skapninger" },
  { key: "bil", label: "Vogner", icon: Car, color: "#6a8caf", desc: "Hester av jern som ankommer" },
  { key: "ringt_pa", label: "Ringt på", icon: Bell, color: "#c97b4a", desc: "Trykk på ringeklokken" },
] as const;

export function VakttarnEventsPanel() {
  const fetchFn = useServerFn(fetchVakttarnEvents);
  const [range, setRange] = useState<Range>("day");
  const [date, setDate] = useState<string>(todayIso());
  const [stats, setStats] = useState<VakttarnStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchFn({ data: { range, date } })
      .then((s) => { if (!cancelled) setStats(s); })
      .catch((e) => console.error("[vakttarn-events]", e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range, date, fetchFn]);

  const total = useMemo(() => {
    if (!stats) return 0;
    return CATS.reduce((sum, c) => sum + (stats.totals[c.key] ?? 0), 0);
  }, [stats]);

  // Date input mode
  const inputType = range === "month" ? "month" : range === "week" ? "week" : "date";
  const inputValue = useMemo(() => {
    if (range === "day") return date;
    const d = new Date(date + "T12:00:00Z");
    if (range === "month") {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    }
    // ISO week
    const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }, [date, range]);

  const handleDateChange = (val: string) => {
    if (range === "day") {
      setDate(val);
    } else if (range === "month") {
      // val = "YYYY-MM"
      setDate(val + "-15");
    } else {
      // val = "YYYY-Www" → derive a date in that week (Thursday of ISO week)
      const m = val.match(/^(\d{4})-W(\d{2})$/);
      if (!m) return;
      const year = Number(m[1]);
      const week = Number(m[2]);
      const simple = new Date(Date.UTC(year, 0, 4));
      const dayOfWeek = simple.getUTCDay() || 7;
      const monday = new Date(simple);
      monday.setUTCDate(simple.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
      const y = monday.getUTCFullYear();
      const mo = String(monday.getUTCMonth() + 1).padStart(2, "0");
      const d = String(monday.getUTCDate()).padStart(2, "0");
      setDate(`${y}-${mo}-${d}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Range selector */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border/50 overflow-hidden">
          {(["day", "week", "month"] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-xs uppercase tracking-wider transition-colors ${
                range === r
                  ? "bg-primary/20 text-primary"
                  : "bg-background/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              {r === "day" ? "Dag" : r === "week" ? "Uke" : "Måned"}
            </button>
          ))}
        </div>

        <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar size={14} />
          <input
            type={inputType}
            value={inputValue}
            onChange={(e) => handleDateChange(e.target.value)}
            className="bg-background/60 border border-border/50 rounded px-2 py-1 text-foreground"
          />
        </div>

        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <Eye size={14} />
          <span>{loading ? "Speider…" : `${total} hendelser`}</span>
        </div>
      </div>

      {/* Counter cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {CATS.map((c) => {
          const Icon = c.icon;
          const count = stats?.totals[c.key] ?? 0;
          return (
            <div
              key={c.key}
              className="relative overflow-hidden rounded-lg border border-border/40 bg-gradient-to-br from-background/80 to-background/40 p-3"
              style={{ borderColor: `${c.color}40` }}
            >
              <div
                className="absolute inset-0 opacity-10 pointer-events-none"
                style={{ background: `radial-gradient(circle at top right, ${c.color}, transparent 70%)` }}
              />
              <div className="relative flex items-start justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {c.label}
                  </div>
                  <div
                    className="font-serif text-3xl mt-1 tabular-nums"
                    style={{ color: c.color, textShadow: `0 0 14px ${c.color}55` }}
                  >
                    {count}
                  </div>
                </div>
                <Icon size={20} style={{ color: c.color }} />
              </div>
              <div className="relative text-[10px] text-muted-foreground/80 mt-1 italic">
                {c.desc}
              </div>
            </div>
          );
        })}
      </div>

      {/* Doorbell stats */}
      {stats?.doorbell && (
        <div className="rounded-lg border border-border/40 bg-gradient-to-r from-[#c97b4a]/10 via-background/40 to-background/40 p-3 flex items-center gap-3">
          <Bell size={22} className="text-[#c97b4a] shrink-0" style={{ filter: "drop-shadow(0 0 6px #c97b4a99)" }} />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Ringeklokken</div>
            <div className="text-xs text-foreground/90">
              <span className="font-serif text-lg text-[#c97b4a] tabular-nums">{stats.doorbell.todayCount}</span>
              <span className="text-muted-foreground"> i dag</span>
              <span className="text-muted-foreground/60"> · </span>
              <span className="font-serif text-lg text-[#c97b4a]/80 tabular-nums">{stats.doorbell.totalCount}</span>
              <span className="text-muted-foreground"> totalt</span>
            </div>
            {stats.doorbell.lastRingAt && (
              <div className="text-[10px] text-muted-foreground/80 italic mt-0.5">
                Sist: {new Date(stats.doorbell.lastRingAt).toLocaleString("no-NO", { dateStyle: "short", timeStyle: "short" })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="rounded-lg border border-border/40 bg-background/40 p-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
          {range === "day"
            ? "Vakthold time for time"
            : range === "week"
            ? "Ukens jakt"
            : "Månedens kronikk"}
        </div>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={stats?.buckets ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {CATS.map((c) => (
                <Bar key={c.key} dataKey={c.key} stackId="a" fill={c.color} name={c.label} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent feed */}
      {stats && stats.recent.length > 0 && (
        <details className="rounded-lg border border-border/40 bg-background/40">
          <summary className="cursor-pointer px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
            Vaktloggen ({stats.recent.length} siste)
          </summary>
          <ul className="divide-y divide-border/30 max-h-64 overflow-y-auto text-xs">
            {stats.recent.map((ev) => {
              const cat = CATS.find((c) => c.key === ev.category);
              const color = cat?.color ?? "#999";
              const t = new Date(ev.detected_at);
              return (
                <li key={ev.id} className="flex items-center gap-2 px-3 py-1.5">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: color, boxShadow: `0 0 6px ${color}` }}
                  />
                  <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                    {t.toLocaleString("no-NO", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                  <span className="capitalize" style={{ color }}>{ev.category}</span>
                  {ev.camera && (
                    <span className="text-muted-foreground italic">@ {ev.camera}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
