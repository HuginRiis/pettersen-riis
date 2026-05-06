import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordApiCall } from "./api-call-log.server";

type Loc = "hytta" | "tollnes";
type Snapshot = { location: Loc; watt: number | null; kwh_today: number | null };

const TIBBER_URL = "https://api.tibber.com/v1-beta/gql";

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

/**
 * Cron: spør Tibber GraphQL etter siste timesforbruk per hjem og lagre i pulse_readings.
 * Bruker HTTP (ikke WebSocket) — fungerer pålitelig i Worker-runtime.
 * Oppløsning: 1 punkt/time.
 */
export async function snapshotPulseToDb(): Promise<{ inserted: number; samples: Snapshot[]; error?: string }> {
  const started = Date.now();
  const token = process.env.TIBBER_TOKEN;
  if (!token) {
    await recordApiCall({
      source: "tibber",
      endpoint: "graphql.consumption.HOURLY[cron]",
      ok: false,
      duration_ms: Date.now() - started,
      error_message: "TIBBER_TOKEN mangler",
    });
    return { inserted: 0, samples: [], error: "TIBBER_TOKEN mangler" };
  }

  try {
    const data = await tibberGql<{
      viewer?: {
        homes?: Array<{
          id: string;
          appNickname: string | null;
          address: { address1: string | null } | null;
          hourly?: { nodes: Array<{ from: string; consumption: number | null }> };
          daily?: { nodes: Array<{ from: string; consumption: number | null }> };
        }>;
      };
    }>(
      token,
      `{ viewer { homes {
        id appNickname address { address1 }
        hourly: consumption(resolution: HOURLY, last: 2) { nodes { from consumption } }
        daily: consumption(resolution: DAILY, last: 1) { nodes { from consumption } }
      } } }`,
    );

    const todayKey = osloDateKey(new Date().toISOString());
    const samples: Snapshot[] = [];

    for (const h of data?.viewer?.homes ?? []) {
      const loc = classify(h.appNickname, h.address?.address1 ?? null);
      if (!loc) continue;

      const hourly = h.hourly?.nodes ?? [];
      const last = [...hourly].reverse().find((n) => n.consumption != null);
      // Estimer "watt nå" fra siste fullførte time (kWh -> W gjennomsnitt)
      const watt = last?.consumption != null ? Math.round(last.consumption * 1000) : null;

      const dailyNode = h.daily?.nodes?.find((n) => osloDateKey(n.from) === todayKey);
      const kwh_today =
        dailyNode?.consumption != null ? Math.round(dailyNode.consumption * 1000) / 1000 : null;

      samples.push({ location: loc, watt, kwh_today });
    }

    if (samples.length === 0) return { inserted: 0, samples: [], error: "ingen hjem matchet" };

    const rows = samples.map((s) => ({
      location: s.location,
      watt: s.watt,
      kwh_today: s.kwh_today,
      device_name: "tibber-gql-cron",
    }));
    const { error } = await supabaseAdmin.from("pulse_readings").insert(rows);
    if (error) return { inserted: 0, samples, error: error.message };
    return { inserted: rows.length, samples };
  } catch (e: any) {
    return { inserted: 0, samples: [], error: e?.message ?? String(e) };
  }
}
