import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "ui-scale";
export type UiScale = "normal" | "large";

function applyScale(scale: UiScale) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (scale === "large") {
    // Tailwind's default base font-size is 16px. 150% = 24px.
    // Since most type uses rem, this scales fonts across the app.
    root.style.fontSize = "150%";
    root.dataset.uiScale = "large";
  } else {
    root.style.fontSize = "";
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
