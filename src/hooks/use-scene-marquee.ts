import { useEffect, useState, useCallback } from "react";

const FONT_KEY = "sceneMarquee.fontPx";
const SPEED_KEY = "sceneMarquee.speedPxPerSec";
const MODE_KEY = "sceneMarquee.mode";
const EVT = "sceneMarquee:change";

export const SCENE_FONT_MIN = 8;
export const SCENE_FONT_MAX = 22;
export const SCENE_SPEED_MIN = 10;
export const SCENE_SPEED_MAX = 200;

export type SceneMarqueeMode = "loop" | "pingpong";

function read(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
function readMode(): SceneMarqueeMode {
  if (typeof window === "undefined") return "loop";
  const raw = window.localStorage.getItem(MODE_KEY);
  return raw === "pingpong" ? "pingpong" : "loop";
}

export function useSceneMarquee() {
  const [fontPx, setFontPxState] = useState<number>(() => read(FONT_KEY, 12));
  const [speedPxPerSec, setSpeedState] = useState<number>(() => read(SPEED_KEY, 40));
  const [mode, setModeState] = useState<SceneMarqueeMode>(() => readMode());

  useEffect(() => {
    const h = () => {
      setFontPxState(read(FONT_KEY, 12));
      setSpeedState(read(SPEED_KEY, 40));
      setModeState(readMode());
    };
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);

  const setFontPx = useCallback((v: number) => {
    const c = Math.max(SCENE_FONT_MIN, Math.min(SCENE_FONT_MAX, Math.round(v)));
    window.localStorage.setItem(FONT_KEY, String(c));
    window.dispatchEvent(new Event(EVT));
  }, []);
  const setSpeed = useCallback((v: number) => {
    const c = Math.max(SCENE_SPEED_MIN, Math.min(SCENE_SPEED_MAX, Math.round(v)));
    window.localStorage.setItem(SPEED_KEY, String(c));
    window.dispatchEvent(new Event(EVT));
  }, []);
  const setMode = useCallback((m: SceneMarqueeMode) => {
    window.localStorage.setItem(MODE_KEY, m);
    window.dispatchEvent(new Event(EVT));
  }, []);

  return { fontPx, speedPxPerSec, mode, setFontPx, setSpeed, setMode };
}
