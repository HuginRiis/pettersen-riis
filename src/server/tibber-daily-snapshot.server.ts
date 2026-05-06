import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordApiCall } from "./api-call-log.server";

const TIBBER_URL = "https://api.tibber.com/v1-beta/gql";

type Loc = "hytta" | "tollnes";

function classify(nick: string | null, addr: string | null): Loc | null {
  const hay = `${nick ?? ""} ${addr ?? ""}`.toLowerCase();
  if (hay.includes("bjørkeset") || hay.includes("bjorkeset") || hay.includes("hytt")) return "hytta";
  if (hay.includes("tollnes") || hay.includes("lensmann")) return "tollnes";
  return null;
}

async function tibberGql<T>(token: string, query: string): Promise<T> {
  const res = await fetch(TIBBER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const json = (await res.json()) as { data?: T; errors?: any };
  if (json.errors) throw new Error(`tibber: ${JSON.stringify(json.errors).slice(0, 200)}`);
  return json.data as T;
}

function osloDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
}

export async function snapshotTibberDailyToDb(): Promise<{
  saved: Array<{ location: Loc; day: string; kwh: number; cost: number | null; source: string }>;
  error?: string;
  sources?: { pulseDays: number; tibberDays: number };
}> {
  const started = Date.now();
  // 1) Pulse-snapshot (mer ferskt, men kan ha hull hvis Pulse var nede)
  const since = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
  const { data: pulseRows } = await supabaseAdmin
    .from("pulse_readings")
    .select("location, recorded_at, kwh_today")
    .gte("recorded_at", since)
    .in("location", ["tollnes", "hytta"])
    .not("kwh_today", "is", null);

  const merged = new Map<string, { location: Loc; day: string; kwh: number; cost: number | null; source: string }>();

  for (const r of (pulseRows ?? []) as Array<{ location: Loc; recorded_at: string; kwh_today: number | null }>) {
    if (r.kwh_today == null || r.kwh_today <= 0) continue;
    const day = osloDateKey(r.recorded_at);
    const key = `${r.location}:${day}`;
    const kwh = Math.round(r.kwh_today * 1000) / 1000;
    const cur = merged.get(key);
    if (!cur || kwh > cur.kwh) merged.set(key, { location: r.location, day, kwh, cost: null, source: "pulse-snapshot" });
  }
  const pulseDays = merged.size;

  // 2) Tibber GraphQL — fyller hull (særlig de dagene Pulse ikke kjørte)
  const token = process.env.TIBBER_TOKEN;
  let tibberError: string | null = null;
  let tibberDays = 0;
  if (token) {
    try {
      const data = await tibberGql<{
        viewer?: {
          homes?: Array<{
            id: string;
            appNickname: string | null;
            address: { address1: string | null } | null;
            daily?: { nodes: Array<{ from: string; consumption: number | null; cost: number | null }> };
          }>;
        };
      }>(
        token,
        `{ viewer { homes {
          id appNickname address { address1 }
          daily: consumption(resolution: DAILY, last: 7) {
            nodes { from consumption cost }
          }
        } } }`,
      );
      for (const h of data?.viewer?.homes ?? []) {
        const loc = classify(h.appNickname, h.address?.address1 ?? null);
        if (!loc) continue;
        for (const n of h.daily?.nodes ?? []) {
          if (n.consumption == null) continue;
          const day = osloDateKey(n.from);
          const key = `${loc}:${day}`;
          const cur = merged.get(key);
          // Tibber overstyrer kun hvis vi mangler data, eller hvis Pulse-tallet
          // er åpenbart lavere (Pulse falt ut midt på dagen).
          if (!cur || n.consumption > cur.kwh + 0.01) {
            merged.set(key, {
              location: loc,
              day,
              kwh: Math.round(n.consumption * 100) / 100,
              cost: n.cost != null ? Math.round(n.cost * 100) / 100 : null,
              source: "tibber-snapshot",
            });
            tibberDays += 1;
          }
        }
      }
    } catch (e: any) {
      tibberError = e?.message ?? "Tibber-feil";
    }
  } else {
    tibberError = "TIBBER_TOKEN mangler";
  }

  const rows = Array.from(merged.values());
  if (rows.length === 0) {
    return { saved: [], error: tibberError ?? "Ingen daglige tall å lagre", sources: { pulseDays, tibberDays } };
  }
  const { error } = await supabaseAdmin
    .from("tibber_daily_kwh")
    .upsert(rows, { onConflict: "location,day" });
  if (error) return { saved: [], error: `DB-feil: ${error.message}`, sources: { pulseDays, tibberDays } };

  return { saved: rows, sources: { pulseDays, tibberDays }, ...(tibberError ? { error: tibberError } : {}) };
}

