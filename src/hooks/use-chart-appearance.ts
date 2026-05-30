import { useEffect, useState } from "react";

/**
 * Fast lys palett for grafer på mørkt tema.
 * Brukerstyrt fargevalg er fjernet — alle grafer bruker disse fargene.
 */

export type ChartAppearance = {
  axisText: string;
  axisLine: string;
  gridHorizontal: string;
  gridVertical: string;
  tooltipText: string;
  tooltipBg: string;
  tooltipBorder: string;
  series: string[];
};

export const CHART_APPEARANCE_DEFAULT: ChartAppearance = {
  axisText: "#fde68a",
  axisLine: "#93c5fd",
  gridHorizontal: "#64748b",
  gridVertical: "#64748b",
  tooltipText: "#f1f5f9",
  tooltipBg: "#1e293b",
  tooltipBorder: "#7dd3fc",
  series: [
    "#4ade80", "#fbbf24", "#f87171", "#60a5fa", "#c084fc",
    "#f472b6", "#2dd4bf", "#facc15", "#fb923c", "#22d3ee",
    "#a3e635", "#a78bfa", "#fb7185", "#34d399", "#818cf8",
  ],
};

export const CHART_APPEARANCE_EVENT = "chart-appearance:changed";

export function normalizeChartAppearance(_value: unknown): ChartAppearance {
  return CHART_APPEARANCE_DEFAULT;
}

export function loadChartAppearance(): ChartAppearance {
  return CHART_APPEARANCE_DEFAULT;
}

export function saveChartAppearance(_s: ChartAppearance) {
  // no-op: fargene er låst
}

export function useChartAppearance(): ChartAppearance {
  const [s] = useState<ChartAppearance>(CHART_APPEARANCE_DEFAULT);
  useEffect(() => {
    // Rydd opp gammelt lagret valg så vi alltid bruker standardene.
    try {
      localStorage.removeItem("chart-appearance-v1");
    } catch {
      /* ignore */
    }
  }, []);
  return s;
}

export function applyChartAppearanceToDocument(s: ChartAppearance) {
  if (typeof document === "undefined") return;
  const r = document.documentElement;
  r.style.setProperty("--chart-axis-text", s.axisText);
  r.style.setProperty("--chart-axis-line", s.axisLine);
  r.style.setProperty("--chart-grid-h", s.gridHorizontal);
  r.style.setProperty("--chart-grid-v", s.gridVertical);
  r.style.setProperty("--chart-tooltip-text", s.tooltipText);
  r.style.setProperty("--chart-tooltip-bg", s.tooltipBg);
  r.style.setProperty("--chart-tooltip-border", s.tooltipBorder);
  s.series.forEach((c, i) => r.style.setProperty(`--chart-series-${i + 1}`, c));
}
