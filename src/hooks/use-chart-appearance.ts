import { useEffect, useState } from "react";

export type ChartAppearance = {
  axisText: string;
  axisLine: string;
  gridHorizontal: string;
  gridVertical: string;
  tooltipText: string;
  tooltipBg: string;
  tooltipBorder: string;
  series: string[]; // 15 grafer
};

export const CHART_APPEARANCE_DEFAULT: ChartAppearance = {
  axisText: "#fef08a",
  axisLine: "#7dd3fc",
  gridHorizontal: "#7dd3fc",
  gridVertical: "#7dd3fc",
  tooltipText: "#7dd3fc",
  tooltipBg: "#0b1220",
  tooltipBorder: "#7dd3fc",
  series: [
    "#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#a855f7",
    "#ec4899", "#14b8a6", "#eab308", "#f97316", "#06b6d4",
    "#84cc16", "#8b5cf6", "#f43f5e", "#10b981", "#6366f1",
  ],
};

const KEY = "chart-appearance-v1";
export const CHART_APPEARANCE_EVENT = "chart-appearance:changed";

const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);

function colorOrDefault(value: unknown, fallback: string) {
  return isHexColor(value) ? value : fallback;
}

export function normalizeChartAppearance(value: unknown): ChartAppearance {
  const parsed = value && typeof value === "object" ? (value as Partial<ChartAppearance>) : {};
  const parsedSeries = Array.isArray(parsed.series) ? parsed.series : [];

  return {
    axisText: colorOrDefault(parsed.axisText, CHART_APPEARANCE_DEFAULT.axisText),
    axisLine: colorOrDefault(parsed.axisLine, CHART_APPEARANCE_DEFAULT.axisLine),
    gridHorizontal: colorOrDefault(parsed.gridHorizontal, CHART_APPEARANCE_DEFAULT.gridHorizontal),
    gridVertical: colorOrDefault(parsed.gridVertical, CHART_APPEARANCE_DEFAULT.gridVertical),
    tooltipText: colorOrDefault(parsed.tooltipText, CHART_APPEARANCE_DEFAULT.tooltipText),
    tooltipBg: colorOrDefault(parsed.tooltipBg, CHART_APPEARANCE_DEFAULT.tooltipBg),
    tooltipBorder: colorOrDefault(parsed.tooltipBorder, CHART_APPEARANCE_DEFAULT.tooltipBorder),
    series: CHART_APPEARANCE_DEFAULT.series.map((fallback, index) =>
      colorOrDefault(parsedSeries[index], fallback),
    ),
  };
}

export function loadChartAppearance(): ChartAppearance {
  if (typeof window === "undefined") return CHART_APPEARANCE_DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return CHART_APPEARANCE_DEFAULT;
    return normalizeChartAppearance(JSON.parse(raw));
  } catch {
    return CHART_APPEARANCE_DEFAULT;
  }
}

export function saveChartAppearance(s: ChartAppearance) {
  if (typeof window === "undefined") return;
  const normalized = normalizeChartAppearance(s);
  localStorage.setItem(KEY, JSON.stringify(normalized));
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
  const normalized = normalizeChartAppearance(s);
  const r = document.documentElement;
  r.style.setProperty("--chart-axis-text", normalized.axisText);
  r.style.setProperty("--chart-axis-line", normalized.axisLine);
  r.style.setProperty("--chart-grid-h", normalized.gridHorizontal);
  r.style.setProperty("--chart-grid-v", normalized.gridVertical);
  r.style.setProperty("--chart-tooltip-text", normalized.tooltipText);
  r.style.setProperty("--chart-tooltip-bg", normalized.tooltipBg);
  r.style.setProperty("--chart-tooltip-border", normalized.tooltipBorder);
  normalized.series.forEach((c, i) => r.style.setProperty(`--chart-series-${i + 1}`, c));
}
