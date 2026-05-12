import { useEffect, useState } from "react";
import { LineChart as LineChartIcon, RotateCcw, Save } from "lucide-react";
import {
  CHART_APPEARANCE_DEFAULT,
  loadChartAppearance,
  normalizeChartAppearance,
  saveChartAppearance,
  type ChartAppearance,
} from "@/hooks/use-chart-appearance";

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-10 rounded border border-border bg-background cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 bg-background border border-border rounded px-2 py-1 text-xs font-mono"
        />
      </span>
    </label>
  );
}

export function ChartAppearanceSettingsPanel() {
  const [draft, setDraft] = useState<ChartAppearance>(() => loadChartAppearance());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    // live preview
    saveChartAppearance(draft);
  }, [draft]);

  const setField = <K extends keyof Omit<ChartAppearance, "series">>(k: K, v: ChartAppearance[K]) =>
    setDraft((d) => normalizeChartAppearance({ ...d, [k]: v }));

  const setSeries = (i: number, c: string) =>
    setDraft((d) => {
      const next = [...d.series] as ChartAppearance["series"];
      next[i] = c;
      return normalizeChartAppearance({ ...d, series: next });
    });

  const onSave = async () => {
    setSaving(true);
    try {
      saveChartAppearance(draft);
      setMsg("Lagret ✓");
      setTimeout(() => setMsg(null), 2500);
    } finally {
      setSaving(false);
    }
  };

  const onReset = () => setDraft(CHART_APPEARANCE_DEFAULT);

  return (
    <section className="container mx-auto px-4 pt-4">
      <article className="panel rounded-lg p-4">
        <h3 className="text-foreground font-semibold flex items-center gap-2">
          <LineChartIcon size={18} className="text-primary" /> Graf-utseende
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Velg farger som brukes på <em>alle</em> grafer på alle sider — akser, gridlinjer,
          tooltip, samt 5 ulike serie-farger. Endringer vises umiddelbart.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="panel rounded p-3 border border-border/50 space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Akser & tekst</p>
            <ColorRow label="Tall på X/Y-akse + andre tekster" value={draft.axisText} onChange={(v) => setField("axisText", v)} />
            <ColorRow label="Selve aksene (linje + tick)" value={draft.axisLine} onChange={(v) => setField("axisLine", v)} />
          </div>

          <div className="panel rounded p-3 border border-border/50 space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Gridlinjer</p>
            <ColorRow label="Horisontale linjer" value={draft.gridHorizontal} onChange={(v) => setField("gridHorizontal", v)} />
            <ColorRow label="Vertikale linjer" value={draft.gridVertical} onChange={(v) => setField("gridVertical", v)} />
          </div>

          <div className="panel rounded p-3 border border-border/50 space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Tooltip</p>
            <ColorRow label="Tekst" value={draft.tooltipText} onChange={(v) => setField("tooltipText", v)} />
            <ColorRow label="Bakgrunn" value={draft.tooltipBg} onChange={(v) => setField("tooltipBg", v)} />
            <ColorRow label="Ramme" value={draft.tooltipBorder} onChange={(v) => setField("tooltipBorder", v)} />
          </div>

          <div className="panel rounded p-3 border border-border/50 space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Serie-farger (5)</p>
            {draft.series.map((c, i) => (
              <ColorRow key={i} label={`Serie ${i + 1}`} value={c} onChange={(v) => setSeries(i, v)} />
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-3 py-2 rounded bg-primary text-primary-foreground text-sm hover:opacity-90 disabled:opacity-50"
          >
            <Save size={14} /> {saving ? "Lagrer…" : "Lagre"}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-2 px-3 py-2 rounded border border-border text-sm hover:bg-accent/40"
          >
            <RotateCcw size={14} /> Tilbakestill
          </button>
          {msg && <span className="text-xs text-emerald-400">{msg}</span>}
        </div>
      </article>
    </section>
  );
}
