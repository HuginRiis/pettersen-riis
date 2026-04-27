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

// ============================================================
// Full Tibber-data per hjem: priser i dag/i morgen, forbruk per oppløsning,
// live-måling (effekt nå om Pulse finnes), adresse/abonnement.
// ============================================================

export type PricePoint = {
  startsAt: string;
  total: number; // kr/kWh inkl. mva
  energy: number;
  tax: number;
  level: string | null; // VERY_CHEAP / CHEAP / NORMAL / EXPENSIVE / VERY_EXPENSIVE
};

export type ConsumptionPoint = {
  from: string;
  to: string | null;
  kwh: number | null;
  cost: number | null;
  unitPrice: number | null;
};

export type TibberHomeFull = {
  location: "hytta" | "tollnes";
  found: boolean;
  id: string | null;
  nickname: string | null;
  address: {
    address1: string | null;
    postalCode: string | null;
    city: string | null;
  } | null;
  size: number | null;
  numberOfResidents: number | null;
  mainFuseSize: number | null;
  hasPulse: boolean;
  hasRealTime: boolean;
  // priser
  priceNow: PricePoint | null;
  pricesToday: PricePoint[];
  pricesTomorrow: PricePoint[];
  priceMinToday: number | null;
  priceMaxToday: number | null;
  priceAvgToday: number | null;
  // forbruk
  hourly: ConsumptionPoint[]; // siste 48 timer
  daily: ConsumptionPoint[]; // siste 60 dager
  weekly: ConsumptionPoint[]; // siste 13 uker
  monthly: ConsumptionPoint[]; // siste 13 måneder
  yearly: ConsumptionPoint[]; // siste 5 år
  // aggregater
  todayKwh: number;
  todayCost: number | null;
  yesterdayKwh: number;
  yesterdayCost: number | null;
  thisMonthKwh: number;
  thisMonthCost: number | null;
  lastMonthKwh: number;
  lastMonthCost: number | null;
  thisYearKwh: number;
  thisYearCost: number | null;
  // siste time som proxy for "effekt nå"
  latestHourKwh: number | null;
  latestHourFrom: string | null;
  error?: string;
};

export type TibberFullResult = {
  ok: boolean;
  fetchedAt: string;
  tollnes: TibberHomeFull;
  hytta: TibberHomeFull;
  homesDebug: string[];
  error?: string;
};

let fullCache: { at: number; data: TibberFullResult } | null = null;
const FULL_TTL_MS = 60_000; // 1 min

function emptyHome(loc: "hytta" | "tollnes", error?: string): TibberHomeFull {
  return {
    location: loc,
    found: false,
    id: null,
    nickname: null,
    address: null,
    size: null,
    numberOfResidents: null,
    mainFuseSize: null,
    hasPulse: false,
    hasRealTime: false,
    priceNow: null,
    pricesToday: [],
    pricesTomorrow: [],
    priceMinToday: null,
    priceMaxToday: null,
    priceAvgToday: null,
    hourly: [],
    daily: [],
    weekly: [],
    monthly: [],
    yearly: [],
    todayKwh: 0,
    todayCost: null,
    yesterdayKwh: 0,
    yesterdayCost: null,
    thisMonthKwh: 0,
    thisMonthCost: null,
    lastMonthKwh: 0,
    lastMonthCost: null,
    thisYearKwh: 0,
    thisYearCost: null,
    latestHourKwh: null,
    latestHourFrom: null,
    error,
  };
}

function mapConsumption(nodes: any[]): ConsumptionPoint[] {
  return (nodes ?? []).map((n) => ({
    from: n.from,
    to: n.to ?? null,
    kwh: typeof n.consumption === "number" ? Math.round(n.consumption * 1000) / 1000 : null,
    cost: typeof n.cost === "number" ? Math.round(n.cost * 100) / 100 : null,
    unitPrice: typeof n.unitPrice === "number" ? n.unitPrice : null,
  }));
}

function mapPrice(p: any): PricePoint | null {
  if (!p) return null;
  return {
    startsAt: p.startsAt,
    total: typeof p.total === "number" ? p.total : 0,
    energy: typeof p.energy === "number" ? p.energy : 0,
    tax: typeof p.tax === "number" ? p.tax : 0,
    level: p.level ?? null,
  };
}

function osloDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
}

function processHome(loc: "hytta" | "tollnes", h: any): TibberHomeFull {
  const hourly = mapConsumption(h?.hourly?.nodes ?? []);
  const daily = mapConsumption(h?.daily?.nodes ?? []);
  const weekly = mapConsumption(h?.weekly?.nodes ?? []);
  const monthly = mapConsumption(h?.monthly?.nodes ?? []);
  const yearly = mapConsumption(h?.yearly?.nodes ?? []);

  const pricesToday: PricePoint[] = (h?.currentSubscription?.priceInfo?.today ?? [])
    .map(mapPrice)
    .filter(Boolean) as PricePoint[];
  const pricesTomorrow: PricePoint[] = (h?.currentSubscription?.priceInfo?.tomorrow ?? [])
    .map(mapPrice)
    .filter(Boolean) as PricePoint[];
  const priceNow = mapPrice(h?.currentSubscription?.priceInfo?.current);

  const todayTotals = pricesToday.map((p) => p.total);
  const priceMinToday = todayTotals.length ? Math.min(...todayTotals) : null;
  const priceMaxToday = todayTotals.length ? Math.max(...todayTotals) : null;
  const priceAvgToday =
    todayTotals.length ? todayTotals.reduce((s, v) => s + v, 0) / todayTotals.length : null;

  // Aggregater fra forbruksrekker
  const todayKey = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = yesterday.toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
  const thisMonth = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" }).slice(0, 7);
  const lastMonthD = new Date();
  lastMonthD.setMonth(lastMonthD.getMonth() - 1);
  const lastMonth = lastMonthD.toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" }).slice(0, 7);
  const thisYear = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" }).slice(0, 4);

  let todayKwh = 0,
    todayCost = 0,
    todayHasCost = false;
  let yKwh = 0,
    yCost = 0,
    yHasCost = false;
  for (const p of hourly) {
    const k = osloDateKey(p.from);
    if (p.kwh == null) continue;
    if (k === todayKey) {
      todayKwh += p.kwh;
      if (p.cost != null) {
        todayCost += p.cost;
        todayHasCost = true;
      }
    } else if (k === yKey) {
      yKwh += p.kwh;
      if (p.cost != null) {
        yCost += p.cost;
        yHasCost = true;
      }
    }
  }

  // Daglig kan dekke "i dag" bedre om hourly mangler — bruk som fallback
  if (todayKwh === 0) {
    const todayDaily = daily.find((d) => osloDateKey(d.from) === todayKey);
    if (todayDaily?.kwh != null) todayKwh = todayDaily.kwh;
    if (todayDaily?.cost != null) {
      todayCost = todayDaily.cost;
      todayHasCost = true;
    }
  }
  if (yKwh === 0) {
    const yd = daily.find((d) => osloDateKey(d.from) === yKey);
    if (yd?.kwh != null) yKwh = yd.kwh;
    if (yd?.cost != null) {
      yCost = yd.cost;
      yHasCost = true;
    }
  }

  let thisMonthKwh = 0,
    thisMonthCost = 0,
    tmHas = false;
  let lastMonthKwh = 0,
    lastMonthCost = 0,
    lmHas = false;
  for (const m of monthly) {
    const key = osloDateKey(m.from).slice(0, 7);
    if (m.kwh == null) continue;
    if (key === thisMonth) {
      thisMonthKwh = m.kwh;
      if (m.cost != null) {
        thisMonthCost = m.cost;
        tmHas = true;
      }
    } else if (key === lastMonth) {
      lastMonthKwh = m.kwh;
      if (m.cost != null) {
        lastMonthCost = m.cost;
        lmHas = true;
      }
    }
  }

  let thisYearKwh = 0,
    thisYearCost = 0,
    tyHas = false;
  for (const y of yearly) {
    const key = osloDateKey(y.from).slice(0, 4);
    if (key === thisYear && y.kwh != null) {
      thisYearKwh = y.kwh;
      if (y.cost != null) {
        thisYearCost = y.cost;
        tyHas = true;
      }
    }
  }

  const last = hourly.length > 0 ? hourly[hourly.length - 1] : null;

  return {
    location: loc,
    found: true,
    id: h?.id ?? null,
    nickname: h?.appNickname ?? null,
    address: h?.address
      ? {
          address1: h.address.address1 ?? null,
          postalCode: h.address.postalCode ?? null,
          city: h.address.city ?? null,
        }
      : null,
    size: h?.size ?? null,
    numberOfResidents: h?.numberOfResidents ?? null,
    mainFuseSize: h?.mainFuseSize ?? null,
    hasPulse: Boolean(h?.features?.realTimeConsumptionEnabled),
    hasRealTime: Boolean(h?.features?.realTimeConsumptionEnabled),
    priceNow,
    pricesToday,
    pricesTomorrow,
    priceMinToday,
    priceMaxToday,
    priceAvgToday: priceAvgToday != null ? Math.round(priceAvgToday * 10000) / 10000 : null,
    hourly,
    daily,
    weekly,
    monthly,
    yearly,
    todayKwh: Math.round(todayKwh * 100) / 100,
    todayCost: todayHasCost ? Math.round(todayCost * 100) / 100 : null,
    yesterdayKwh: Math.round(yKwh * 100) / 100,
    yesterdayCost: yHasCost ? Math.round(yCost * 100) / 100 : null,
    thisMonthKwh: Math.round(thisMonthKwh * 10) / 10,
    thisMonthCost: tmHas ? Math.round(thisMonthCost * 100) / 100 : null,
    lastMonthKwh: Math.round(lastMonthKwh * 10) / 10,
    lastMonthCost: lmHas ? Math.round(lastMonthCost * 100) / 100 : null,
    thisYearKwh: Math.round(thisYearKwh * 10) / 10,
    thisYearCost: tyHas ? Math.round(thisYearCost * 100) / 100 : null,
    latestHourKwh: last?.kwh ?? null,
    latestHourFrom: last?.from ?? null,
  };
}

export const getTibberFullData = createServerFn({ method: "GET" }).handler(
  withApiLog("tibber", "getTibberFullData", async (): Promise<TibberFullResult> => {
    const token = process.env.TIBBER_TOKEN;
    const empty: TibberFullResult = {
      ok: false,
      fetchedAt: new Date().toISOString(),
      tollnes: emptyHome("tollnes"),
      hytta: emptyHome("hytta"),
      homesDebug: [],
    };
    if (!token) return { ...empty, error: "TIBBER_TOKEN mangler" };

    if (fullCache && Date.now() - fullCache.at < FULL_TTL_MS) {
      return fullCache.data;
    }

    const query = `{
      viewer {
        homes {
          id
          appNickname
          size
          numberOfResidents
          mainFuseSize
          address { address1 postalCode city }
          features { realTimeConsumptionEnabled }
          currentSubscription {
            priceInfo {
              current { startsAt total energy tax level }
              today { startsAt total energy tax level }
              tomorrow { startsAt total energy tax level }
            }
          }
          hourly: consumption(resolution: HOURLY, last: 48) {
            nodes { from to consumption cost unitPrice }
          }
          daily: consumption(resolution: DAILY, last: 60) {
            nodes { from to consumption cost unitPrice }
          }
          weekly: consumption(resolution: WEEKLY, last: 13) {
            nodes { from to consumption cost unitPrice }
          }
          monthly: consumption(resolution: MONTHLY, last: 13) {
            nodes { from to consumption cost unitPrice }
          }
          yearly: consumption(resolution: ANNUAL, last: 5) {
            nodes { from to consumption cost unitPrice }
          }
        }
      }
    }`;

    try {
      const data = await tibberQuery<{ viewer?: { homes?: any[] } }>(token, query);
      const homes = data?.viewer?.homes ?? [];
      const debug = homes.map(
        (h) => `${h.appNickname ?? "?"} (${h.address?.address1 ?? "?"}) → ${classifyHome(h) ?? "ukjent"}`,
      );

      const tollnesHome = homes.find((h) => classifyHome(h) === "tollnes");
      const hyttaHome = homes.find((h) => classifyHome(h) === "hytta");

      const result: TibberFullResult = {
        ok: true,
        fetchedAt: new Date().toISOString(),
        tollnes: tollnesHome
          ? processHome("tollnes", tollnesHome)
          : emptyHome("tollnes", "Fant ikke Tollnes-hjem hos Tibber"),
        hytta: hyttaHome
          ? processHome("hytta", hyttaHome)
          : emptyHome("hytta", "Fant ikke hytta hos Tibber"),
        homesDebug: debug,
      };

      fullCache = { at: Date.now(), data: result };
      return result;
    } catch (e: any) {
      return { ...empty, error: e?.message ?? "Ukjent feil" };
    }
  }),
);

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
