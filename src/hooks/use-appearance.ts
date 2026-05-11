import { useEffect, useState, useCallback } from "react";

const FONT_KEY = "appearance.fontDeltaPct"; // -20..+20
const WIDTH_KEY = "appearance.contentWidthPct"; // 40..100

const FONT_EVENT = "appearance:font";
const WIDTH_EVENT = "appearance:width";

export const FONT_MIN = -20;
export const FONT_MAX = 20;
export const WIDTH_MIN = 40;
export const WIDTH_MAX = 100;

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

export function useFontDeltaPct(): [number, (v: number) => void] {
  const [v, setV] = useState<number>(() => getFontDeltaPct());
  useEffect(() => {
    const h = () => setV(getFontDeltaPct());
    window.addEventListener(FONT_EVENT, h);
    return () => window.removeEventListener(FONT_EVENT, h);
  }, []);
  const set = useCallback((next: number) => {
    const clamped = Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round(next)));
    window.localStorage.setItem(FONT_KEY, String(clamped));
    window.dispatchEvent(new Event(FONT_EVENT));
  }, []);
  return [v, set];
}

export function useContentWidthPct(): [number, (v: number) => void] {
  const [v, setV] = useState<number>(() => getContentWidthPct());
  useEffect(() => {
    const h = () => setV(getContentWidthPct());
    window.addEventListener(WIDTH_EVENT, h);
    return () => window.removeEventListener(WIDTH_EVENT, h);
  }, []);
  const set = useCallback((next: number) => {
    const clamped = Math.max(WIDTH_MIN, Math.min(WIDTH_MAX, Math.round(next)));
    window.localStorage.setItem(WIDTH_KEY, String(clamped));
    window.dispatchEvent(new Event(WIDTH_EVENT));
  }, []);
  return [v, set];
}

export const APPEARANCE_EVENTS = { FONT_EVENT, WIDTH_EVENT };
