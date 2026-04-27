import { createServerFn } from "@tanstack/react-start";
import { withApiLog } from "./api-call-log.server";

const TIBBER_URL = "https://api.tibber.com/v1-beta/gql";

export type MonthlyKwh = {
  month: string; // "YYYY-MM"
  hytta_kwh: number;
  tollnes_kwh: number;
};

export type HourlyKwh = {
  from: string; // ISO
  hour: string; // "HH:00"
  kwh: number;
  cost: number | null;
};

type HomeNode = {
  id: string;
  appNickname: string | null;
  address: { address1: string | null } | null;
  consumption: {
    nodes: Array<{
      from: string;
      consumption: number | null;
      cost?: number | null;
    }>;
  };
};

let monthlyCache: { at: number; data: MonthlyKwh[] } | null = null;
const MONTHLY_TTL_MS = 30 * 60_000; // 30 min

// Per-home hourly cache, kortere TTL siden vi vil ha "live" oppdatering hvert minutt.
const hourlyCache = new Map<
  "hytta" | "tollnes",
  { at: number; data: HourlyKwh[] }
>();
const HOURLY_TTL_MS = 60_000; // 1 min

function classifyHome(h: HomeNode): "hytta" | "tollnes" | null {
  const hay = `${h.appNickname ?? ""} ${h.address?.address1 ?? ""}`.toLowerCase();
  if (
    hay.includes("bjørkeset") ||
    hay.includes("bjorkeset") ||
    hay.includes("hytt") ||
    hay.trim() === "hytta"
  ) {
    return "hytta";
  }
  if (
    hay.includes("tollnes") ||
    hay.includes("lensmannsveg") ||
    hay.includes("lensmannsvei") ||
    hay.includes("lensmann")
  ) {
    return "tollnes";
  }
  return null;
}

async function tibberQuery<T = any>(token: string, query: string): Promise<T> {
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
  const json = (await res.json()) as { data?: T; errors?: any };
  if (json.errors) throw new Error(`Tibber GraphQL: ${JSON.stringify(json.errors).slice(0, 200)}`);
  return json.data as T;
}

async function fetchMonthlyHomes(token: string): Promise<HomeNode[]> {
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
  const data = await tibberQuery<{ viewer?: { homes?: HomeNode[] } }>(token, query);
  return data?.viewer?.homes ?? [];
}

async function fetchHourlyHomes(token: string, hours = 25): Promise<HomeNode[]> {
  const query = `{
    viewer {
      homes {
        id
        appNickname
        address { address1 }
        consumption(resolution: HOURLY, last: ${hours}) {
          nodes { from consumption cost }
        }
      }
    }
  }`;
  const data = await tibberQuery<{ viewer?: { homes?: HomeNode[] } }>(token, query);
  return data?.viewer?.homes ?? [];
}

export const getTibberMonthly = createServerFn({ method: "GET" }).handler(
  withApiLog("tibber", "getTibberMonthly", async (): Promise<{ months: MonthlyKwh[]; error?: string; homes?: string[] }> => {
    const token = process.env.TIBBER_TOKEN;
    if (!token) return { months: [], error: "TIBBER_TOKEN mangler" };

    if (monthlyCache && Date.now() - monthlyCache.at < MONTHLY_TTL_MS) {
      return { months: monthlyCache.data };
    }

    try {
      const homes = await fetchMonthlyHomes(token);
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

      monthlyCache = { at: Date.now(), data: months };
      return { months, homes: homeNames };
    } catch (e: any) {
      return { months: [], error: e?.message ?? "Ukjent feil" };
    }
  }),
);

export type TibberHourlyResult = {
  hours: HourlyKwh[];
  todayKwh: number;
  todayCost: number | null;
  latestHourKwh: number | null;
  latestHourFrom: string | null;
  error?: string;
};

export const getTibberHourly = createServerFn({ method: "GET" })
  .inputValidator((data: { location: "hytta" | "tollnes" }) => data)
  .handler(withApiLog("tibber", "getTibberHourly", async ({ data }: { data: { location: "hytta" | "tollnes" } }): Promise<TibberHourlyResult> => {
    const token = process.env.TIBBER_TOKEN;
    if (!token) {
      return {
        hours: [],
        todayKwh: 0,
        todayCost: null,
        latestHourKwh: null,
        latestHourFrom: null,
        error: "TIBBER_TOKEN mangler",
      };
    }

    const cached = hourlyCache.get(data.location);
    if (cached && Date.now() - cached.at < HOURLY_TTL_MS) {
      return computeHourlySummary(cached.data);
    }

    try {
      const homes = await fetchHourlyHomes(token, 25);
      const home = homes.find((h) => classifyHome(h) === data.location);
      if (!home) {
        return {
          hours: [],
          todayKwh: 0,
          todayCost: null,
          latestHourKwh: null,
          latestHourFrom: null,
          error: `Fant ikke ${data.location} hos Tibber`,
        };
      }

      const hours: HourlyKwh[] = (home.consumption?.nodes ?? [])
        .filter((n) => n.consumption != null)
        .map((n) => {
          const d = new Date(n.from);
          const hh = d.getHours().toString().padStart(2, "0");
          return {
            from: n.from,
            hour: `${hh}:00`,
            kwh: Math.round((n.consumption as number) * 1000) / 1000,
            cost: typeof n.cost === "number" ? n.cost : null,
          };
        });

      hourlyCache.set(data.location, { at: Date.now(), data: hours });
      return computeHourlySummary(hours);
    } catch (e: any) {
      return {
        hours: [],
        todayKwh: 0,
        todayCost: null,
        latestHourKwh: null,
        latestHourFrom: null,
        error: e?.message ?? "Ukjent feil",
      };
    }
  }));

function computeHourlySummary(hours: HourlyKwh[]): TibberHourlyResult {
  // "I dag" = lokal kalender-dato i Europe/Oslo. Tibber returnerer ISO med tz-offset,
  // så vi sammenligner på dato-streng i Oslo-tid via toLocaleDateString.
  const todayKey = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Europe/Oslo",
  });
  let todayKwh = 0;
  let todayCost = 0;
  let hasCost = false;
  for (const h of hours) {
    const dKey = new Date(h.from).toLocaleDateString("sv-SE", {
      timeZone: "Europe/Oslo",
    });
    if (dKey === todayKey) {
      todayKwh += h.kwh;
      if (h.cost != null) {
        todayCost += h.cost;
        hasCost = true;
      }
    }
  }
  const last = hours.length > 0 ? hours[hours.length - 1] : null;
  return {
    hours,
    todayKwh: Math.round(todayKwh * 100) / 100,
    todayCost: hasCost ? Math.round(todayCost * 100) / 100 : null,
    latestHourKwh: last?.kwh ?? null,
    latestHourFrom: last?.from ?? null,
  };
}
