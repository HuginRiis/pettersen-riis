import { useEffect, useState } from "react";

export type ChartAppearance = {
  axisText: string;       // tall på x/y akse + andre tekster i grafen
  axisLine: string;       // selve aksene + tick-strek
  gridHorizontal: string; // horisontale gridlinjer
  gridVertical: string;   // vertikale gridlinjer
  tooltipText: string;    // tekst i tooltip
  tooltipBg: string;      // bakgrunn i tooltip
  tooltipBorder: string;  // ramme i tooltip
  series: [string, string, string, string, string]; // 5 grafer
};

export const CHART_APPEARANCE_DEFAULT: ChartAppearance = {
  axisText: "#fef08a",
  axisLine: "#7dd3fc",
  gridHorizontal: "#7dd3fc",
  gridVertical: "#7dd3fc",
  tooltipText: "#7dd3fc",
  tooltipBg: "#0b1220",
  tooltipBorder: "#7dd3fc",
  series: ["#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#a855f7"],
};

const KEY = "chart-appearance-v1";
export const CHART_APPEARANCE_EVENT = "chart-appearance:changed";

export function loadChartAppearance(): ChartAppearance {
  if (typeof window === "undefined") return CHART_APPEARANCE_DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return CHART_APPEARANCE_DEFAULT;
    const parsed = JSON.parse(raw);
    return { ...CHART_APPEARANCE_DEFAULT, ...parsed, series: { ...CHART_APPEARANCE_DEFAULT.series, ...(parsed.series ?? {}) } as any };
  } catch {
    return CHART_APPEARANCE_DEFAULT;
  }
}

export function saveChartAppearance(s: ChartAppearance) {
  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new Event(CHART_APPEARANCE_EVENT));
}

export function useChartAppearance(): ChartAppearance {
  const [s, setS] = useState<ChartAppearance>(() => loadChartAppearance());
  useEffect(() => {
    const on = () => setS(loadChartAppearance());
    window.addEventListener(CHART_APPEARANCE_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(CHART_APPEARANCE_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return s;
}

export function applyChartAppearanceToDocument(s: ChartAppearance) {
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
