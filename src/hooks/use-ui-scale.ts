import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "ui-scale";
export type UiScale = "normal" | "large";

function applyScale(scale: UiScale) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (scale === "large") {
    root.style.setProperty("zoom", "1.5");
    root.dataset.uiScale = "large";
  } else {
    root.style.removeProperty("zoom");
    root.dataset.uiScale = "normal";
  }
}

export function useUiScale() {
  const [scale, setScaleState] = useState<UiScale>("normal");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = (window.localStorage.getItem(STORAGE_KEY) as UiScale | null) ?? "normal";
    setScaleState(saved);
    applyScale(saved);
  }, []);

  const setScale = useCallback((next: UiScale) => {
    setScaleState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
    applyScale(next);
  }, []);

  const toggle = useCallback(() => {
    setScale(scale === "large" ? "normal" : "large");
  }, [scale, setScale]);

  return { scale, setScale, toggle };
}
