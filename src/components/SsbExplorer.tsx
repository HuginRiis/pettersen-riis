import { useEffect, useMemo, useState } from "react";
import {
  fetchSsbMetadata,
  fetchSsbData,
  type SsbMetadata,
  type SsbResult,
  type SsbSelection,
} from "@/lib/ssb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Search, X } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from "recharts";

export type SsbExplorerConfig = {
  tableId: string;
  title: string;
  description?: string;
  xAxis: string; // dimension code used as x-axis (usually Tid)
  series?: string; // dimension code used as series (lines/bars)
  defaultSelection?: SsbSelection; // initial codes per dimension
  defaultSeriesTopN?: number;
  chart?: "line" | "bar";
};

const COLORS = [
  "#d4af37",
  "#60a5fa",
  "#34d399",
  "#f472b6",
  "#fb923c",
  "#a78bfa",
  "#22d3ee",
  "#ef4444",
  "#facc15",
  "#10b981",
  "#38bdf8",
  "#e879f9",
  "#fbbf24",
  "#94a3b8",
  "#f43f5e",
];

export function SsbExplorer({ config }: { config: SsbExplorerConfig }) {
  const [meta, setMeta] = useState<SsbMetadata | null>(null);
  const [selection, setSelection] = useState<SsbSelection>({});
  const [data, setData] = useState<SsbResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartType, setChartType] = useState<"line" | "bar">(config.chart ?? "line");

  // Load metadata
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setMeta(null);
    setData(null);
    fetchSsbMetadata(config.tableId)
      .then((m) => {
        if (cancelled) return;
        setMeta(m);
        // Build default selection: from config or sensible defaults
        const sel: SsbSelection = {};
        for (const v of m.variables) {
          const fromDefault = config.defaultSelection?.[v.code];
          if (fromDefault && fromDefault.length) {
            sel[v.code] = fromDefault;
            continue;
          }
          if (v.code === config.xAxis) {
            // x-axis: pick last 10 values (typically time), but include 2026 if present
            const has2026 = v.values.includes("2026");
            if (has2026) {
              sel[v.code] = v.values.slice(-11);
            } else {
              sel[v.code] = v.values.slice(-10);
            }
            continue;
          }
          if (v.code === config.series) {
            sel[v.code] = v.values.slice(0, config.defaultSeriesTopN ?? 5);
            continue;
          }
          // Other dimensions: pick first value (so we get a single slice)
          sel[v.code] = v.values.slice(0, 1);
        }
        setSelection(sel);
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [config.tableId]);

  // Fetch data when selection changes
  useEffect(() => {
    if (!meta || Object.keys(selection).length === 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSsbData(config.tableId, selection)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [meta, selection, config.tableId]);

  const chartData = useMemo(() => {
    if (!data) return { rows: [], series: [] as string[] };
    const xDim = config.xAxis;
    const sDim = config.series;
    if (!sDim) {
      const rows = data.rows.map((r) => ({ x: r[xDim], value: r.__value }));
      return { rows, series: ["value"] };
    }
    const byX = new Map<string, Record<string, number | string | null>>();
    const seriesSet = new Set<string>();
    for (const r of data.rows) {
      const x = r[xDim] as string;
      const s = r[sDim] as string;
      if (!byX.has(x)) byX.set(x, { x });
      byX.get(x)![s] = r.__value;
      seriesSet.add(s);
    }
    // Maintain x order from metadata
    const xLabels = meta!.variables.find((v) => v.code === xDim)?.valueTexts ?? [];
    const orderedRows = [...byX.values()].sort(
      (a, b) => xLabels.indexOf(a.x as string) - xLabels.indexOf(b.x as string),
    );
    return { rows: orderedRows, series: [...seriesSet] };
  }, [data, meta, config.xAxis, config.series]);

  return (
    <Card className="border-amber-900/40 bg-zinc-900/70">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-amber-200">{config.title}</CardTitle>
            {config.description && (
              <p className="mt-1 text-sm text-zinc-400">{config.description}</p>
            )}
            <p className="mt-1 text-xs text-zinc-500">
              SSB tabell {config.tableId} · {meta?.title ?? "laster…"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={chartType === "line" ? "default" : "outline"}
              onClick={() => setChartType("line")}
            >
              Linje
            </Button>
            <Button
              size="sm"
              variant={chartType === "bar" ? "default" : "outline"}
              onClick={() => setChartType("bar")}
            >
              Stolpe
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Filters */}
        {meta && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {meta.variables.map((v) => (
              <DimensionFilter
                key={v.code}
                variable={v}
                selected={selection[v.code] ?? []}
                onChange={(vals) =>
                  setSelection((s) => ({ ...s, [v.code]: vals }))
                }
              />
            ))}
          </div>
        )}

        {/* Chart */}
        <div className="relative h-80 w-full rounded border border-zinc-800 bg-zinc-950/60 p-2">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/60">
              <Loader2 className="h-6 w-6 animate-spin text-amber-300" />
            </div>
          )}
          {chartData.rows.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "line" ? (
                <LineChart data={chartData.rows}>
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                  <XAxis dataKey="x" stroke="#a1a1aa" fontSize={11} />
                  <YAxis stroke="#a1a1aa" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "#18181b",
                      border: "1px solid #3f3f46",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {chartData.series.map((s, i) => (
                    <Line
                      key={s}
                      type="monotone"
                      dataKey={s}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              ) : (
                <BarChart data={chartData.rows}>
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                  <XAxis dataKey="x" stroke="#a1a1aa" fontSize={11} />
                  <YAxis stroke="#a1a1aa" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "#18181b",
                      border: "1px solid #3f3f46",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {chartData.series.map((s, i) => (
                    <Bar key={s} dataKey={s} fill={COLORS[i % COLORS.length]} />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
          {!loading && chartData.rows.length === 0 && !error && (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
              Velg filtre for å vise data
            </div>
          )}
        </div>

        {/* Data table preview */}
        {data && data.rows.length > 0 && (
          <details className="rounded border border-zinc-800 bg-zinc-950/40">
            <summary className="cursor-pointer px-3 py-2 text-sm text-zinc-300">
              Vis rådata ({data.rows.length} rader)
            </summary>
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-zinc-900">
                  <tr>
                    {data.dims.map((d) => (
                      <th
                        key={d.code}
                        className="px-2 py-1.5 text-left font-medium text-amber-300"
                      >
                        {d.text}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-right font-medium text-amber-300">
                      Verdi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.slice(0, 500).map((r, i) => (
                    <tr key={i} className="border-t border-zinc-800/60">
                      {data.dims.map((d) => (
                        <td key={d.code} className="px-2 py-1 text-zinc-300">
                          {r[d.code]}
                        </td>
                      ))}
                      <td className="px-2 py-1 text-right font-mono text-zinc-100">
                        {r.__value === null
                          ? "—"
                          : r.__value.toLocaleString("no-NO")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function DimensionFilter({
  variable,
  selected,
  onChange,
}: {
  variable: { code: string; text: string; values: string[]; valueTexts: string[] };
  selected: string[];
  onChange: (vals: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const options = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = variable.values.map((code, i) => ({
      code,
      label: variable.valueTexts[i] ?? code,
    }));
    if (!q) return items;
    return items.filter((it) => it.label.toLowerCase().includes(q));
  }, [search, variable]);

  const toggle = (code: string) => {
    if (selected.includes(code)) onChange(selected.filter((c) => c !== code));
    else onChange([...selected, code]);
  };

  const selectedLabels = selected
    .map((c) => {
      const idx = variable.values.indexOf(c);
      return idx >= 0 ? variable.valueTexts[idx] : c;
    })
    .slice(0, 3);

  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/40 p-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <label className="font-medium text-amber-200">
          {variable.text}{" "}
          <span className="text-xs font-normal text-zinc-500">
            ({selected.length}/{variable.values.length})
          </span>
        </label>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Lukk" : "Endre"}
        </Button>
      </div>
      {!open && (
        <div className="mt-1 flex flex-wrap gap-1">
          {selectedLabels.map((l) => (
            <Badge key={l} variant="secondary" className="text-[10px]">
              {l}
            </Badge>
          ))}
          {selected.length > 3 && (
            <Badge variant="outline" className="text-[10px]">
              +{selected.length - 3}
            </Badge>
          )}
        </div>
      )}
      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2 h-3 w-3 text-zinc-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Søk…"
                className="h-7 pl-7 text-xs"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => onChange([])}
              title="Fjern alle"
            >
              <X className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => onChange(variable.values.slice(0, 20))}
              title="Topp 20"
            >
              20
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => onChange(variable.values.slice(-10))}
              title="Siste 10"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
          <div className="max-h-48 overflow-auto rounded border border-zinc-800/60">
            {options.slice(0, 300).map((opt) => {
              const isSel = selected.includes(opt.code);
              return (
                <button
                  key={opt.code}
                  onClick={() => toggle(opt.code)}
                  className={`flex w-full items-center justify-between px-2 py-1 text-left text-xs hover:bg-zinc-800 ${
                    isSel ? "bg-amber-900/30 text-amber-100" : "text-zinc-300"
                  }`}
                >
                  <span>{opt.label}</span>
                  {isSel && <span className="text-amber-300">✓</span>}
                </button>
              );
            })}
            {options.length > 300 && (
              <div className="px-2 py-1 text-[10px] text-zinc-500">
                Viser 300 av {options.length} — søk for å snevre inn.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
