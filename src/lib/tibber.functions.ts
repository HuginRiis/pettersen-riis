import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";

const __loadAdmin = createIsomorphicFn()
  .server((): Promise<typeof import("@/integrations/supabase/client.server")> =>
    import("@/integrations/supabase/client.server"),
  )
  .client(
    (): Promise<typeof import("@/integrations/supabase/client.server")> =>
      Promise.resolve({ supabaseAdmin: null } as unknown as typeof import("@/integrations/supabase/client.server")),
  );
const { supabaseAdmin } = await __loadAdmin();

const __loadLogger = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/api-call-log.server")> =>
    import("@/lib/api-call-log.server"),
  )
  .client(
    (): Promise<typeof import("@/lib/api-call-log.server")> =>
      Promise.resolve({
        withApiLog: ((_s: any, _n: any, fn: any) => fn) as any,
      } as unknown as typeof import("@/lib/api-call-log.server")),
  );
const { withApiLog } = await __loadLogger();

export type StoredDailyKwh = {
  location: "hytta" | "tollnes";
  day: string; // YYYY-MM-DD
  kwh: number;
  cost: number | null;
};

export const getStoredDailyKwh = createServerFn({ method: "GET" }).handler(
  withApiLog("tibber", "getStoredDailyKwh", async (): Promise<{ rows: StoredDailyKwh[]; error?: string }> => {
    try {
      const since = new Date();
      since.setDate(since.getDate() - 365);
      const sinceKey = since.toISOString().slice(0, 10);
      const { data, error } = await supabaseAdmin
        .from("tibber_daily_kwh")
        .select("location, day, kwh, cost")
        .gte("day", sinceKey)
        .order("day", { ascending: true });
      if (error) return { rows: [], error: error.message };
      const rows: StoredDailyKwh[] = (data ?? []).map((r: any) => ({
        location: r.location,
        day: r.day,
        kwh: Number(r.kwh) || 0,
        cost: r.cost != null ? Number(r.cost) : null,
      }));
      return { rows };
    } catch (e: any) {
      return { rows: [], error: e?.message ?? "Ukjent feil" };
    }
  }),
);


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

// ============================================================
// Live WebSocket-info: returneres til klient som så åpner WSS direkte
// mot Tibber. Tokenet sendes til nettleseren — appen er passord-beskyttet,
// så det er akseptabelt for familiebruk.
// ============================================================

export type TibberLiveSession = {
  ok: boolean;
  wsUrl: string | null;
  token: string | null;
  homes: Array<{ location: "hytta" | "tollnes"; homeId: string; nickname: string | null; hasPulse: boolean }>;
  error?: string;
};

let liveSessionCache: { at: number; data: TibberLiveSession } | null = null;
const LIVE_SESSION_TTL_MS = 10 * 60_000; // 10 min

export const getTibberLiveSession = createServerFn({ method: "GET" }).handler(
  withApiLog("tibber", "getTibberLiveSession", async (): Promise<TibberLiveSession> => {
    const token = process.env.TIBBER_TOKEN;
    if (!token) {
      return { ok: false, wsUrl: null, token: null, homes: [], error: "TIBBER_TOKEN mangler" };
    }
    if (liveSessionCache && Date.now() - liveSessionCache.at < LIVE_SESSION_TTL_MS) {
      return liveSessionCache.data;
    }
    try {
      const query = `{
        viewer {
          websocketSubscriptionUrl
          homes {
            id
            appNickname
            address { address1 }
            features { realTimeConsumptionEnabled }
          }
        }
      }`;
      const data = await tibberQuery<{
        viewer?: {
          websocketSubscriptionUrl?: string;
          homes?: Array<{
            id: string;
            appNickname: string | null;
            address: { address1: string | null } | null;
            features: { realTimeConsumptionEnabled: boolean } | null;
          }>;
        };
      }>(token, query);
      const wsUrl = data?.viewer?.websocketSubscriptionUrl ?? null;
      const homes: TibberLiveSession["homes"] = [];
      for (const h of data?.viewer?.homes ?? []) {
        const loc = classifyHome(h as any);
        if (!loc) continue;
        homes.push({
          location: loc,
          homeId: h.id,
          nickname: h.appNickname,
          hasPulse: Boolean(h.features?.realTimeConsumptionEnabled),
        });
      }
      const result: TibberLiveSession = {
        ok: Boolean(wsUrl) && homes.length > 0,
        wsUrl,
        token,
        homes,
      };
      liveSessionCache = { at: Date.now(), data: result };
      return result;
    } catch (e: any) {
      return { ok: false, wsUrl: null, token: null, homes: [], error: e?.message ?? "Ukjent feil" };
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

// ---- Weekly VU-meter (siste ~8 døgn) for Steintavlen ----
export type TibberWeeklyMeter = {
  location: "hytta" | "tollnes";
  latestHourKwh: number | null;
  latestHourFrom: string | null;
  todayKwh: number;
  todayMaxHourKwh: number | null;
  weeklyAvgHourKwh: number | null; // snitt per time forrige 7 døgn (eks. i dag)
  weeklyMaxHourKwh: number | null;
  error?: string;
};

const weeklyMeterCache = new Map<
  "hytta" | "tollnes",
  { at: number; data: TibberWeeklyMeter }
>();
const WEEKLY_METER_TTL_MS = 5 * 60_000;

export const getTibberWeeklyMeter = createServerFn({ method: "GET" })
  .inputValidator((data: { location: "hytta" | "tollnes" }) => data)
  .handler(
    withApiLog(
      "tibber",
      "getTibberWeeklyMeter",
      async ({
        data,
      }: {
        data: { location: "hytta" | "tollnes" };
      }): Promise<TibberWeeklyMeter> => {
        const empty: TibberWeeklyMeter = {
          location: data.location,
          latestHourKwh: null,
          latestHourFrom: null,
          todayKwh: 0,
          todayMaxHourKwh: null,
          weeklyAvgHourKwh: null,
          weeklyMaxHourKwh: null,
        };

        const token = process.env.TIBBER_TOKEN;
        if (!token) return { ...empty, error: "TIBBER_TOKEN mangler" };

        const cached = weeklyMeterCache.get(data.location);
        if (cached && Date.now() - cached.at < WEEKLY_METER_TTL_MS) {
          return cached.data;
        }

        try {
          const homes = await fetchHourlyHomes(token, 24 * 8);
          const home = homes.find((h) => classifyHome(h) === data.location);
          if (!home) {
            return { ...empty, error: `Fant ikke ${data.location} hos Tibber` };
          }

          const nodes = (home.consumption?.nodes ?? []).filter(
            (n) => n.consumption != null,
          );
          const todayKey = new Date().toLocaleDateString("sv-SE", {
            timeZone: "Europe/Oslo",
          });

          let todayKwh = 0;
          let todayMax = 0;
          let weeklySum = 0;
          let weeklyCount = 0;
          let weeklyMax = 0;

          for (const n of nodes) {
            const kwh = n.consumption as number;
            const dKey = new Date(n.from).toLocaleDateString("sv-SE", {
              timeZone: "Europe/Oslo",
            });
            if (dKey === todayKey) {
              todayKwh += kwh;
              if (kwh > todayMax) todayMax = kwh;
            } else {
              weeklySum += kwh;
              weeklyCount += 1;
              if (kwh > weeklyMax) weeklyMax = kwh;
            }
          }

          const last = nodes.length > 0 ? nodes[nodes.length - 1] : null;

          // Fallback for ukesnitt: hvis Tibber HOURLY ikke gir nok timer,
          // hent fra pulse_readings (PBTH-snapshots fra cron).
          let weeklyAvgKwh: number | null =
            weeklyCount > 0 ? weeklySum / weeklyCount : null;
          let weeklyMaxKwh: number | null = weeklyMax > 0 ? weeklyMax : null;
          if (weeklyAvgKwh == null || weeklyCount < 24) {
            try {
              const sinceIso = new Date(
                Date.now() - 7 * 24 * 60 * 60 * 1000,
              ).toISOString();
              const { data: pulseRows } = await supabaseAdmin
                .from("pulse_readings")
                .select("watt")
                .eq("location", data.location)
                .gte("recorded_at", sinceIso)
                .not("watt", "is", null);
              const watts = (pulseRows ?? [])
                .map((r: any) => Number(r.watt))
                .filter((v: number) => Number.isFinite(v) && v >= 0);
              if (watts.length > 0) {
                const avgW = watts.reduce((s, v) => s + v, 0) / watts.length;
                const maxW = Math.max(...watts);
                weeklyAvgKwh = avgW / 1000; // W -> "kWh per time"
                if (weeklyMaxKwh == null) weeklyMaxKwh = maxW / 1000;
              }
            } catch {
              // ignorér – la weeklyAvgKwh forbli null
            }
          }

          const result: TibberWeeklyMeter = {
            location: data.location,
            latestHourKwh:
              last && last.consumption != null
                ? Math.round((last.consumption as number) * 1000) / 1000
                : null,
            latestHourFrom: last?.from ?? null,
            todayKwh: Math.round(todayKwh * 100) / 100,
            todayMaxHourKwh: todayMax > 0 ? Math.round(todayMax * 1000) / 1000 : null,
            weeklyAvgHourKwh:
              weeklyAvgKwh != null ? Math.round(weeklyAvgKwh * 1000) / 1000 : null,
            weeklyMaxHourKwh:
              weeklyMaxKwh != null ? Math.round(weeklyMaxKwh * 1000) / 1000 : null,
          };

          weeklyMeterCache.set(data.location, { at: Date.now(), data: result });
          return result;
        } catch (e: any) {
          return { ...empty, error: e?.message ?? "Ukjent feil" };
        }
      },
    ),
  );

// ============================================================
// Effekttrinn: de 3 timene med høyest forbruk per måned (maks én per døgn).
// ============================================================
export type PeakHour = { from: string; kwh: number };
export type PeakMonth = { month: string; peaks: PeakHour[]; avgKw: number };
export type PeakHoursResult = {
  homes: Partial<Record<"hytta" | "tollnes", PeakMonth[]>>;
  error?: string;
};
let peakCache: { at: number; data: PeakHoursResult } | null = null;

export const getTibberPeakHours = createServerFn({ method: "GET" }).handler(
  withApiLog("tibber", "getTibberPeakHours", async (): Promise<PeakHoursResult> => {
    const token = process.env.TIBBER_TOKEN;
    if (!token) return { homes: {}, error: "TIBBER_TOKEN mangler" };
    if (peakCache && Date.now() - peakCache.at < 30 * 60_000) return peakCache.data;
    try {
      const homes = await fetchHourlyHomes(token, 24 * 186);
      const out: PeakHoursResult = { homes: {} };
      const dayKey = (iso: string) =>
        new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
      for (const h of homes) {
        const loc = classifyHome(h);
        if (!loc) continue;
        const byMonth = new Map<string, Map<string, PeakHour>>();
        for (const n of h.consumption?.nodes ?? []) {
          if (n.consumption == null) continue;
          const d = dayKey(n.from);
          const m = d.slice(0, 7);
          const days = byMonth.get(m) ?? new Map<string, PeakHour>();
          const cur = days.get(d);
          if (!cur || n.consumption > cur.kwh) days.set(d, { from: n.from, kwh: n.consumption });
          byMonth.set(m, days);
        }
        out.homes[loc] = Array.from(byMonth.entries())
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([month, days]) => {
            const peaks = Array.from(days.values()).sort((a, b) => b.kwh - a.kwh).slice(0, 3);
            const avgKw = peaks.length ? peaks.reduce((s, p) => s + p.kwh, 0) / peaks.length : 0;
            return { month, peaks, avgKw };
          });
      }
      peakCache = { at: Date.now(), data: out };
      return out;
    } catch (e: any) {
      return { homes: {}, error: e?.message ?? "Ukjent feil" };
    }
  }),
);
