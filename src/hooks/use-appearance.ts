import { useEffect, useState, useCallback } from "react";

const FONT_KEY = "appearance.fontDeltaPct"; // -20..+20
const WIDTH_KEY = "appearance.contentWidthPct"; // 50..150 (default 100)
const HEADER_INSET_KEY = "appearance.headerLeftInsetPct"; // 0..50 (% of viewport)

const FONT_EVENT = "appearance:font";
const WIDTH_EVENT = "appearance:width";
const HEADER_INSET_EVENT = "appearance:headerInset";

export const FONT_MIN = -20;
export const FONT_MAX = 20;
export const WIDTH_MIN = 50;
export const WIDTH_MAX = 150;
export const HEADER_INSET_MIN = 0;
export const HEADER_INSET_MAX = 50;

function read(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function getFontDeltaPct(): number {
  return read(FONT_KEY, 0);
}
export function getContentWidthPct(): number {
  return read(WIDTH_KEY, 100);
}
export function getHeaderLeftInsetPct(): number {
  return read(HEADER_INSET_KEY, 0);
}

function makeHook(
  key: string,
  evt: string,
  min: number,
  max: number,
  getter: () => number,
): () => [number, (v: number) => void] {
  return function useV(): [number, (v: number) => void] {
    const [v, setV] = useState<number>(() => getter());
    useEffect(() => {
      const h = () => setV(getter());
      window.addEventListener(evt, h);
      return () => window.removeEventListener(evt, h);
    }, []);
    const set = useCallback((next: number) => {
      const clamped = Math.max(min, Math.min(max, Math.round(next)));
      window.localStorage.setItem(key, String(clamped));
      window.dispatchEvent(new Event(evt));
    }, []);
    return [v, set];
  };
}

export const useFontDeltaPct = makeHook(FONT_KEY, FONT_EVENT, FONT_MIN, FONT_MAX, getFontDeltaPct);
export const useContentWidthPct = makeHook(WIDTH_KEY, WIDTH_EVENT, WIDTH_MIN, WIDTH_MAX, getContentWidthPct);
export const useHeaderLeftInsetPct = makeHook(HEADER_INSET_KEY, HEADER_INSET_EVENT, HEADER_INSET_MIN, HEADER_INSET_MAX, getHeaderLeftInsetPct);

export const APPEARANCE_EVENTS = { FONT_EVENT, WIDTH_EVENT, HEADER_INSET_EVENT };
