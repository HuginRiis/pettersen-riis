import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Home = { homeId: string; location: "hytta" | "tollnes" };

type Snapshot = {
  location: "hytta" | "tollnes";
  watt: number | null;
  kwh_today: number | null;
};

const TIBBER_URL = "https://api.tibber.com/v1-beta/gql";

function classify(nick: string | null, addr: string | null): "hytta" | "tollnes" | null {
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

async function discoverHomes(token: string): Promise<{ wsUrl: string; homes: Home[] }> {
  const data = await tibberGql<{
    viewer?: {
      websocketSubscriptionUrl?: string;
      homes?: Array<{
        id: string;
        appNickname: string | null;
        address: { address1: string | null } | null;
        features: { realTimeConsumptionEnabled: boolean } | null;
      }>;
    };
  }>(
    token,
    `{ viewer { websocketSubscriptionUrl homes { id appNickname address { address1 } features { realTimeConsumptionEnabled } } } }`,
  );
  const wsUrl = data?.viewer?.websocketSubscriptionUrl ?? "";
  const homes: Home[] = [];
  for (const h of data?.viewer?.homes ?? []) {
    if (!h.features?.realTimeConsumptionEnabled) continue;
    const loc = classify(h.appNickname, h.address?.address1 ?? null);
    if (!loc) continue;
    homes.push({ homeId: h.id, location: loc });
  }
  if (!wsUrl) throw new Error("ingen websocketSubscriptionUrl");
  return { wsUrl, homes };
}

/** Åpne WS, abonner på liveMeasurement for ett hjem, vent på første verdi, lukk. */
function fetchOneSample(wsUrl: string, token: string, home: Home, timeoutMs = 8000): Promise<Snapshot | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: Snapshot | null) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      resolve(v);
    };
    const ws = new WebSocket(wsUrl, "graphql-transport-ws");
    const timer = setTimeout(() => finish(null), timeoutMs);

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "connection_init", payload: { token } }));
    });
    ws.addEventListener("message", (ev: MessageEvent) => {
      let m: any;
      try { m = JSON.parse(typeof ev.data === "string" ? ev.data : ""); } catch { return; }
      if (m.type === "connection_ack") {
        ws.send(JSON.stringify({
          id: "1",
          type: "subscribe",
          payload: {
            query: `subscription { liveMeasurement(homeId: "${home.homeId}") { power accumulatedConsumption } }`,
          },
        }));
      } else if (m.type === "next" && m.payload?.data?.liveMeasurement) {
        const lm = m.payload.data.liveMeasurement;
        clearTimeout(timer);
        finish({
          location: home.location,
          watt: typeof lm.power === "number" ? lm.power : null,
          kwh_today: typeof lm.accumulatedConsumption === "number" ? lm.accumulatedConsumption : null,
        });
      } else if (m.type === "error" || m.type === "connection_error") {
        clearTimeout(timer);
        finish(null);
      }
    });
    ws.addEventListener("error", () => { clearTimeout(timer); finish(null); });
    ws.addEventListener("close", () => { clearTimeout(timer); finish(null); });
  });
}

/** Server-side cron: åpne Tibber WS, snap én måling per hjem, lagre i pulse_readings. */
export async function snapshotPulseToDb(): Promise<{ inserted: number; samples: Snapshot[]; error?: string }> {
  const token = process.env.TIBBER_TOKEN;
  if (!token) return { inserted: 0, samples: [], error: "TIBBER_TOKEN mangler" };
  try {
    const { wsUrl, homes } = await discoverHomes(token);
    if (homes.length === 0) return { inserted: 0, samples: [], error: "ingen Pulse-hjem" };
    const samples = await Promise.all(homes.map((h) => fetchOneSample(wsUrl, token, h)));
    const valid = samples.filter((s): s is Snapshot => s !== null);
    if (valid.length === 0) return { inserted: 0, samples: [] };
    const rows = valid.map((s) => ({
      location: s.location,
      watt: s.watt,
      kwh_today: s.kwh_today,
      device_name: "tibber-ws-cron",
    }));
    const { error } = await supabaseAdmin.from("pulse_readings").insert(rows);
    if (error) return { inserted: 0, samples: valid, error: error.message };
    return { inserted: rows.length, samples: valid };
  } catch (e: any) {
    return { inserted: 0, samples: [], error: e?.message ?? String(e) };
  }
}
