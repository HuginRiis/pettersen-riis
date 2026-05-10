import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type BadgeSetting = { enabled: boolean; users: string[] };
export type HeaderBadgeSettings = {
  badges: Record<string, BadgeSetting>;
  weather: { startOffset: 0 | 1; days: number; showTemp: boolean };
};

export const HEADER_BADGE_KEY = "header_badges";

export const HEADER_BADGE_DEFS: { id: string; label: string }[] = [
  { id: "uv_hjem", label: "UV (Hjem)" },
  { id: "temp_tollnes", label: "Temperatur Tollnes (Hjem)" },
  { id: "uv_hytta", label: "UV (Hytta)" },
  { id: "temp_hytta", label: "Temperatur Hytta" },
  { id: "pollen", label: "Pollen" },
  { id: "push_today", label: "Antall push i dag (Innstillinger)" },
  { id: "lights_on", label: "Lys tent (Lys)" },
  { id: "weather_days", label: "Værmelding (dager fremover)" },
  { id: "weather_temp", label: "Temperatur nå (Vær)" },
  { id: "mower_status", label: "Gressklipper-status (Smartborg)" },
  { id: "alarm_state", label: "Alarm-status (Vakttårnet)" },
  { id: "utgangsdoren_lock", label: "Utgangsdøren låst/åpen (Vakttårnet)" },
  { id: "alerts_severity", label: "Farevarsler" },
  { id: "power_vs_yesterday", label: "Strøm i dag vs i går" },
  { id: "steps_arne", label: "Skritt Arne (Trening)" },
  { id: "steps_rebekka", label: "Skritt Rebekka (Trening)" },
  { id: "training_4w", label: "Trening siste 4 uker" },
  { id: "usage_count", label: "Bruks-teller på meny" },
  { id: "garbage_next", label: "Neste søppeltømming (Agenda)" },
];

export const DEFAULT_HEADER_BADGE_SETTINGS: HeaderBadgeSettings = {
  badges: Object.fromEntries(
    HEADER_BADGE_DEFS.map((b) => [b.id, { enabled: true, users: [] as string[] }]),
  ),
  weather: { startOffset: 1, days: 1, showTemp: true },
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
  return { badges, weather };
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
