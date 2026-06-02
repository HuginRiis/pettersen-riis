// Master API-blackout: tidsvindu der ALLE eksterne API-kall blokkeres.
// Brukes sammen med isApiSourcePaused i withApiLog/loggedFetch.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type BlackoutConfig = {
  enabled: boolean;
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
  updated_at: string;
};

type CacheEntry = { cfg: BlackoutConfig | null; expires: number };
const g = globalThis as unknown as { __apiBlackoutCache?: CacheEntry };
const TTL_MS = 15_000;

function normalize(t: string): string {
  // "HH:MM" eller "HH:MM:SS" → "HH:MM"
  const m = /^(\d{2}):(\d{2})/.exec(t);
  return m ? `${m[1]}:${m[2]}` : t;
}

export async function getBlackoutConfig(): Promise<BlackoutConfig> {
  const now = Date.now();
  if (g.__apiBlackoutCache && g.__apiBlackoutCache.expires > now && g.__apiBlackoutCache.cfg) {
    return g.__apiBlackoutCache.cfg;
  }
  try {
    const { data } = (await (supabaseAdmin.from("api_blackout_window") as any)
      .select("enabled,start_time,end_time,updated_at")
      .eq("id", 1)
      .maybeSingle()) as { data: BlackoutConfig | null };
    const cfg: BlackoutConfig = data
      ? {
          enabled: Boolean(data.enabled),
          start_time: normalize(data.start_time),
          end_time: normalize(data.end_time),
          updated_at: data.updated_at,
        }
      : { enabled: false, start_time: "00:00", end_time: "06:00", updated_at: new Date().toISOString() };
    g.__apiBlackoutCache = { cfg, expires: now + TTL_MS };
    return cfg;
  } catch {
    const cfg: BlackoutConfig = { enabled: false, start_time: "00:00", end_time: "06:00", updated_at: new Date().toISOString() };
    return cfg;
  }
}

export function invalidateBlackoutCache() {
  g.__apiBlackoutCache = undefined;
}

/**
 * Hent nåværende Europe/Oslo-tid som minutter etter midnatt (0..1439).
 */
function osloMinutesNow(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => Number(n) || 0);
  return h * 60 + m;
}

export async function isInBlackoutWindow(): Promise<boolean> {
  const cfg = await getBlackoutConfig();
  if (!cfg.enabled) return false;
  const start = toMinutes(cfg.start_time);
  const end = toMinutes(cfg.end_time);
  if (start === end) return false; // 0-lengde
  const now = osloMinutesNow();
  if (start < end) {
    // Samme døgn
    return now >= start && now < end;
  }
  // Vinduet krysser midnatt
  return now >= start || now < end;
}

export async function setBlackoutConfig(
  enabled: boolean,
  start_time: string,
  end_time: string,
): Promise<void> {
  await (supabaseAdmin.from("api_blackout_window") as any).upsert(
    {
      id: 1,
      enabled,
      start_time: normalize(start_time),
      end_time: normalize(end_time),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  invalidateBlackoutCache();
}
