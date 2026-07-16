import { useEffect, useState } from "react";

export type TempUnit = "c" | "f";

export const TEMP_UNIT_STORAGE_KEY = "temp-unit";
export const TEMP_UNIT_EVENT = "temp-unit-change";

export const TEMP_UNITS: { id: TempUnit; label: string; short: string }[] = [
  { id: "c", label: "Celsius", short: "°C" },
  { id: "f", label: "Fahrenheit", short: "°F" },
];

export function tempUnitShort(unit: TempUnit): string {
  return unit === "f" ? "°F" : "°C";
}

/** Konverter fra Celsius til valgt enhet. */
export function convertFromC(vC: number, unit: TempUnit): number {
  return unit === "f" ? vC * 9 / 5 + 32 : vC;
}

/**
 * Formater en verdi gitt i Celsius til valgt enhet.
 * Standard: heltall + `°` (eller `°F` når withUnit).
 */
export function formatTemp(
  vC: number | null | undefined,
  unit: TempUnit,
  opts: { digits?: number; withUnit?: boolean; withDegree?: boolean } = {},
): string {
  if (vC === null || vC === undefined || !Number.isFinite(vC)) return "—";
  const { digits = 0, withUnit = false, withDegree = true } = opts;
  const v = convertFromC(vC, unit);
  const rounded = digits === 0 ? Math.round(v).toString() : v.toFixed(digits);
  if (withUnit) return `${rounded}${withDegree ? "°" : ""}${unit === "f" ? "F" : "C"}`;
  return withDegree ? `${rounded}°` : rounded;
}

function readUnit(): TempUnit {
  if (typeof window === "undefined") return "c";
  try {
    const raw = window.localStorage.getItem(TEMP_UNIT_STORAGE_KEY);
    if (raw === "c" || raw === "f") return raw;
  } catch {}
  return "c";
}

export function useTempUnit(): [TempUnit, (u: TempUnit) => void] {
  const [unit, setUnit] = useState<TempUnit>("c");

  useEffect(() => {
    setUnit(readUnit());
    const onStorage = (e: StorageEvent) => {
      if (e.key === TEMP_UNIT_STORAGE_KEY) setUnit(readUnit());
    };
    const onCustom = () => setUnit(readUnit());
    window.addEventListener("storage", onStorage);
    window.addEventListener(TEMP_UNIT_EVENT, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(TEMP_UNIT_EVENT, onCustom);
    };
  }, []);

  const set = (u: TempUnit) => {
    try {
      window.localStorage.setItem(TEMP_UNIT_STORAGE_KEY, u);
    } catch {}
    setUnit(u);
    try {
      window.dispatchEvent(new Event(TEMP_UNIT_EVENT));
    } catch {}
  };

  return [unit, set];
}
