import { createServerFn } from "@tanstack/react-start";

const TIBBER_URL = "https://api.tibber.com/v1-beta/gql";

export type MonthlyKwh = {
  month: string; // "YYYY-MM"
  hytta_kwh: number;
  tollnes_kwh: number;
};

type HomeNode = {
  id: string;
  appNickname: string | null;
  address: { address1: string | null } | null;
  consumption: {
    nodes: Array<{ from: string; consumption: number | null }>;
  };
};

let cache: { at: number; data: MonthlyKwh[] } | null = null;
const TTL_MS = 30 * 60_000; // 30 min

function classifyHome(h: HomeNode): "hytta" | "tollnes" | null {
  const hay = `${h.appNickname ?? ""} ${h.address?.address1 ?? ""}`.toLowerCase();
  if (hay.includes("bjørkeset") || hay.includes("bjorkeset") || hay.includes("hytt")) {
    return "hytta";
  }
  if (hay.includes("tollnes")) return "tollnes";
  return null;
}

async function fetchTibber(token: string): Promise<HomeNode[]> {
  // last=12 → siste 12 hele måneder pluss inneværende
  const query = `{
    viewer {
      homes {
        id
        appNickname
        address { address1 }
        consumption(resolution: MONTHLY, last: 13) {
          nodes { from consumption }
        }
      }
    }
  }`;
  const res = await fetch(TIBBER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Tibber ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data?: { viewer?: { homes?: HomeNode[] } }; errors?: any };
  if (json.errors) throw new Error(`Tibber GraphQL: ${JSON.stringify(json.errors).slice(0, 200)}`);
  return json.data?.viewer?.homes ?? [];
}

export const getTibberMonthly = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ months: MonthlyKwh[]; error?: string; homes?: string[] }> => {
    const token = process.env.TIBBER_TOKEN;
    if (!token) return { months: [], error: "TIBBER_TOKEN mangler" };

    if (cache && Date.now() - cache.at < TTL_MS) {
      return { months: cache.data };
    }

    try {
      const homes = await fetchTibber(token);
      const monthly = new Map<string, { hytta: number; tollnes: number }>();
      const homeNames: string[] = [];

      for (const h of homes) {
        const loc = classifyHome(h);
        homeNames.push(`${h.appNickname ?? "?"} (${h.address?.address1 ?? "?"}) → ${loc ?? "ukjent"}`);
        if (!loc) continue;
        for (const n of h.consumption?.nodes ?? []) {
          if (n.consumption == null) continue;
          const month = new Date(n.from).toISOString().slice(0, 7);
          const cur = monthly.get(month) ?? { hytta: 0, tollnes: 0 };
          if (loc === "hytta") cur.hytta += n.consumption;
          else cur.tollnes += n.consumption;
          monthly.set(month, cur);
        }
      }

      const months: MonthlyKwh[] = Array.from(monthly.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({
          month,
          hytta_kwh: Math.round(v.hytta * 10) / 10,
          tollnes_kwh: Math.round(v.tollnes * 10) / 10,
        }));

      cache = { at: Date.now(), data: months };
      return { months, homes: homeNames };
    } catch (e: any) {
      return { months: [], error: e?.message ?? "Ukjent feil" };
    }
  },
);
