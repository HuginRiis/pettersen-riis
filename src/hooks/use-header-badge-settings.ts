import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type BadgeSetting = { enabled: boolean; users: string[] };
export type TrainingSportToggles = { run: boolean; ride: boolean; swim: boolean; walk: boolean; hike: boolean };
export type HeaderBadgeSettings = {
  badges: Record<string, BadgeSetting>;
  weather: { startOffset: 0 | 1; days: number; showTemp: boolean };
  garbage: { maxDaysAhead: number; showAllSameDay: boolean };
  training: TrainingSportToggles;
  fitOneLine: boolean;
};

export const HEADER_BADGE_KEY = "header_badges";

export const HEADER_BADGE_DEFS: { id: string; label: string }[] = [
  { id: "uv_hjem", label: "UV-indeks · meny: Hjem" },
  { id: "temp_tollnes", label: "Temperatur ute Tollnes · meny: Hjem" },
  { id: "temp_stua_tollnes", label: "Temperatur stua Tollnes · meny: Hjem" },
  { id: "uv_hytta", label: "UV-indeks Hytta · meny: Hytta" },
  { id: "temp_hytta", label: "Temperatur ute Hytta · meny: Hytta" },
  { id: "temp_stua_hytta", label: "Temperatur stua Hytta · meny: Hytta" },
  { id: "pollen", label: "Pollen · meny: Pollen" },
  { id: "push_today", label: "Antall push i dag · meny: Push-varslinger" },
  { id: "lights_on", label: "Lys tent · meny: Lys" },
  { id: "weather_days", label: "Værmelding (dager fremover) · meny: Vær" },
  { id: "weather_temp", label: "Temperatur nå · meny: Vær" },
  { id: "mower_status", label: "Gressklipper-status · meny: Smartborg" },
  { id: "roborock_hjemme_status", label: "Støvsuger Hjemme – status · meny: Støvsugeren" },
  { id: "roborock_hytta_status", label: "Støvsuger Hytta – status · meny: Støvsugeren" },
  { id: "gardena_status", label: "Gardena status · meny: Gressklipper" },
  { id: "gardena_battery", label: "Gardena batteri % · meny: Gressklipper" },
  { id: "gardena_signal", label: "Gardena signalstyrke · meny: Gressklipper" },
  { id: "alarm_state", label: "Alarm-status · meny: Vakttårnet" },
  { id: "utgangsdoren_lock", label: "Utgangsdøren låst/åpen · meny: Vakttårnet" },
  { id: "alerts_severity", label: "Farevarsler · meny: Varsler" },
  { id: "power_vs_yesterday", label: "Strøm i dag vs i går · meny: Strømkroniken" },
  { id: "steps_arne", label: "Skritt Arne · meny: Trening" },
  { id: "steps_rebekka", label: "Skritt Rebekka · meny: Trening" },
  { id: "training_4w", label: "Trening siste 4 uker (Arne) · meny: Trening" },
  { id: "training_4w_rebekka", label: "Trening siste 4 uker (Rebekka) · meny: Trening" },
  { id: "usage_count", label: "Bruks-teller · meny: alle (når sortering på bruk er på)" },
  { id: "garbage_next", label: "Neste søppeltømming · meny: Agenda" },
  { id: "budget_remaining", label: "Budsjett igjen · meny: Husholdningens hvelv" },
  { id: "okonomi_brukt", label: "Brukt denne måned · meny: Husholdningens hvelv" },
  { id: "okonomi_inntekt", label: "Inntekt denne måned · meny: Husholdningens hvelv" },
  { id: "okonomi_budsjett", label: "Budsjett totalt · meny: Husholdningens hvelv" },
  { id: "okonomi_overskudd", label: "Overskudd · meny: Husholdningens hvelv" },
  { id: "okonomi_snitt_dag", label: "Snitt brukt pr dag · meny: Husholdningens hvelv" },
  { id: "okonomi_igjen_dag", label: "Igjen pr dag til lønn · meny: Husholdningens hvelv" },
];

export const DEFAULT_HEADER_BADGE_SETTINGS: HeaderBadgeSettings = {
  badges: Object.fromEntries(
    HEADER_BADGE_DEFS.map((b) => [b.id, { enabled: true, users: [] as string[] }]),
  ),
  weather: { startOffset: 1, days: 1, showTemp: true },
  garbage: { maxDaysAhead: 14, showAllSameDay: false },
  training: { run: true, ride: true, swim: true, walk: true, hike: true },
  fitOneLine: false,
};

let cache: HeaderBadgeSettings | null = null;
let inflight: Promise<HeaderBadgeSettings> | null = null;
const listeners = new Set<(s: HeaderBadgeSettings) => void>();

function merge(value: unknown): HeaderBadgeSettings {
  const v = (value ?? {}) as Partial<HeaderBadgeSettings>;
  const badges: Record<string, BadgeSetting> = { ...DEFAULT_HEADER_BADGE_SETTINGS.badges };
  for (const def of HEADER_BADGE_DEFS) {
    const cur = (v.badges ?? {})[def.id];
    if (cur) badges[def.id] = { enabled: cur.enabled !== false, users: Array.isArray(cur.users) ? cur.users : [] };
  }
  const weather = {
    startOffset: (v.weather?.startOffset === 0 ? 0 : 1) as 0 | 1,
    days: Math.min(14, Math.max(1, Number(v.weather?.days ?? 1))),
    showTemp: v.weather?.showTemp !== false,
  };
  const garbage = {
    maxDaysAhead: Math.min(30, Math.max(0, Number(v.garbage?.maxDaysAhead ?? 14))),
    showAllSameDay: v.garbage?.showAllSameDay === true,
  };
  const t = (v as any).training ?? {};
  const training: TrainingSportToggles = {
    run: t.run !== false,
    ride: t.ride !== false,
    swim: t.swim !== false,
    walk: t.walk !== false,
    hike: t.hike !== false,
  };
  const fitOneLine = (v as any).fitOneLine === true;
  return { badges, weather, garbage, training, fitOneLine };
}

async function load(): Promise<HeaderBadgeSettings> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data } = await supabase
        .from("notification_settings")
        .select("value")
        .eq("key", HEADER_BADGE_KEY)
        .maybeSingle();
      const merged = merge(data?.value);
      cache = merged;
      return merged;
    } catch {
      cache = DEFAULT_HEADER_BADGE_SETTINGS;
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useHeaderBadgeSettings(): HeaderBadgeSettings {
  const [s, setS] = useState<HeaderBadgeSettings>(() => cache ?? DEFAULT_HEADER_BADGE_SETTINGS);
  useEffect(() => {
    let cancelled = false;
    if (!cache) load().then((v) => { if (!cancelled) setS(v); });
    const cb = (v: HeaderBadgeSettings) => setS(v);
    listeners.add(cb);
    return () => { cancelled = true; listeners.delete(cb); };
  }, []);
  return s;
}

export async function saveHeaderBadgeSettings(next: HeaderBadgeSettings): Promise<void> {
  cache = next;
  for (const cb of listeners) cb(next);
  const { data: existing } = await supabase
    .from("notification_settings")
    .select("id")
    .eq("key", HEADER_BADGE_KEY)
    .maybeSingle();
  if (existing?.id) {
    await supabase.from("notification_settings").update({ value: next as never, updated_at: new Date().toISOString() }).eq("id", existing.id);
  } else {
    await supabase.from("notification_settings").insert({ key: HEADER_BADGE_KEY, value: next as never });
  }
}

export function isBadgeVisible(s: HeaderBadgeSettings, id: string, who: string): boolean {
  const cfg = s.badges[id];
  if (!cfg) return true;
  if (!cfg.enabled) return false;
  if (!cfg.users || cfg.users.length === 0) return true;
  return cfg.users.includes(who);
}
