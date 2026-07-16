import { useEffect, useState } from "react";

export type WindUnit = "ms" | "kmh" | "kn" | "mph" | "bft";

export const WIND_UNIT_STORAGE_KEY = "wind-unit";
export const WIND_UNIT_EVENT = "wind-unit-change";

export const WIND_UNITS: { id: WindUnit; label: string; short: string }[] = [
  { id: "ms", label: "meter per sekund", short: "m/s" },
  { id: "kmh", label: "kilometer per time", short: "km/t" },
  { id: "kn", label: "knop", short: "kn" },
  { id: "mph", label: "mile per time", short: "mph" },
  { id: "bft", label: "Beaufort", short: "Bft" },
];

export function windUnitShort(unit: WindUnit): string {
  return WIND_UNITS.find((u) => u.id === unit)?.short ?? "m/s";
}

/** Konverter fra m/s til valgt enhet. */
export function convertFromMs(vMs: number, unit: WindUnit): number {
  switch (unit) {
    case "ms":
      return vMs;
    case "kmh":
      return vMs * 3.6;
    case "kn":
      return vMs * 1.943844;
    case "mph":
      return vMs * 2.236936;
    case "bft":
      return msToBeaufort(vMs);
  }
}

function msToBeaufort(v: number): number {
  // Standard Beaufort-terskler (m/s)
  const t = [0.3, 1.5, 3.3, 5.5, 7.9, 10.7, 13.8, 17.1, 20.7, 24.4, 28.4, 32.6];
  let b = 0;
  for (const x of t) if (v >= x) b++;
  return b;
}

/** Formatter en verdi gitt i m/s til valgt enhet. */
export function formatWind(
  vMs: number | null | undefined,
  unit: WindUnit,
  opts: { digits?: number; withUnit?: boolean } = {},
): string {
  if (vMs === null || vMs === undefined || !Number.isFinite(vMs)) return "—";
  const { digits, withUnit = true } = opts;
  const v = convertFromMs(vMs, unit);
  const d =
    typeof digits === "number"
      ? digits
      : unit === "bft"
        ? 0
        : unit === "kmh" || unit === "mph"
          ? 0
          : 1;
  const rounded = d === 0 ? Math.round(v).toString() : v.toFixed(d);
  return withUnit ? `${rounded} ${windUnitShort(unit)}` : rounded;
}

/** Konverter fra km/t (f.eks. Netatmo) til valgt enhet. */
export function formatWindFromKmh(
  vKmh: number | null | undefined,
  unit: WindUnit,
  opts: { digits?: number; withUnit?: boolean } = {},
): string {
  if (vKmh === null || vKmh === undefined || !Number.isFinite(vKmh)) return "—";
  return formatWind(vKmh / 3.6, unit, opts);
}

function readUnit(): WindUnit {
  if (typeof window === "undefined") return "ms";
  try {
    const raw = window.localStorage.getItem(WIND_UNIT_STORAGE_KEY);
    if (raw && WIND_UNITS.some((u) => u.id === raw)) return raw as WindUnit;
  } catch {}
  return "ms";
}

export function useWindUnit(): [WindUnit, (u: WindUnit) => void] {
  const [unit, setUnit] = useState<WindUnit>("ms");

  useEffect(() => {
    setUnit(readUnit());
    const onStorage = (e: StorageEvent) => {
      if (e.key === WIND_UNIT_STORAGE_KEY) setUnit(readUnit());
    };
    const onCustom = () => setUnit(readUnit());
    window.addEventListener("storage", onStorage);
    window.addEventListener(WIND_UNIT_EVENT, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(WIND_UNIT_EVENT, onCustom);
    };
  }, []);

  const set = (u: WindUnit) => {
    try {
      window.localStorage.setItem(WIND_UNIT_STORAGE_KEY, u);
    } catch {}
    setUnit(u);
    try {
      window.dispatchEvent(new Event(WIND_UNIT_EVENT));
    } catch {}
  };

  return [unit, set];
}
