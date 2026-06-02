import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import { getRequest, getRequestHeader, useSession } from "@tanstack/react-start/server";
const __loadAdmin = createIsomorphicFn()
  .server((): Promise<typeof import("@/integrations/supabase/client.server")> =>
    import("@/integrations/supabase/client.server"),
  )
  .client(
    (): Promise<typeof import("@/integrations/supabase/client.server")> =>
      Promise.resolve({ supabaseAdmin: null } as unknown as typeof import("@/integrations/supabase/client.server")),
  );
const { supabaseAdmin } = await __loadAdmin();
const __loadApiLog = createIsomorphicFn()
  .server((): Promise<typeof import("@/server/api-call-log.server")> =>
    import("@/server/api-call-log.server"),
  )
  .client(
    (): Promise<typeof import("@/server/api-call-log.server")> =>
      Promise.resolve({
        loggedFetch: ((_s: any, _n: any, url: any, init: any) => fetch(url, init)) as any,
        withApiLog: ((_s: any, _n: any, fn: any) => fn) as any,
      } as unknown as typeof import("@/server/api-call-log.server")),
  );
const { loggedFetch } = await __loadApiLog();

// Mirror of the session config in src/server/auth.ts — kept inline to avoid a
// circular import. Used by `releaseIpFn` to ensure only authenticated users
// (the lord and lady of the house) can free a locked-out IP.
type AuthSessionData = { authenticated?: boolean; loggedInAt?: number };
function getAuthSessionConfig() {
  const base = process.env.HOUSE_RIIS_PASSWORD ?? "";
  const derived = (base + "::house-riis-session-v1::winter-is-ours").repeat(4).slice(0, 64);
  return {
    password: derived,
    name: "house_riis_session",
    maxAge: 60 * 60 * 24 * 30,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none" as const,
      path: "/",
    },
  };
}

type GeoInfo = {
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  isp: string | null;
};

type UAInfo = {
  deviceType: string;
  os: string;
  browser: string;
};

function parseClientIp(): string | null {
  try {
    const xff = getRequestHeader("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
    const cf = getRequestHeader("cf-connecting-ip");
    if (cf) return cf;
    const real = getRequestHeader("x-real-ip");
    if (real) return real;
  } catch {
    // ignore
  }
  return null;
}

function parseUserAgent(ua: string): UAInfo {
  const lower = ua.toLowerCase();
  let deviceType = "Desktop";
  if (/mobile|iphone|android.*mobile|windows phone/.test(lower)) deviceType = "Mobil";
  else if (/ipad|tablet|android(?!.*mobile)/.test(lower)) deviceType = "Nettbrett";

  let os = "Ukjent";
  if (/windows nt 10/.test(lower)) os = "Windows 10/11";
  else if (/windows nt/.test(lower)) os = "Windows";
  else if (/iphone|ipad|ipod/.test(lower)) {
    const m = ua.match(/OS (\d+[_\d]*)/);
    os = m ? `iOS ${m[1]!.replace(/_/g, ".")}` : "iOS";
  } else if (/mac os x/.test(lower)) os = "macOS";
  else if (/android/.test(lower)) {
    const m = ua.match(/Android (\d+(\.\d+)?)/);
    os = m ? `Android ${m[1]}` : "Android";
  } else if (/linux/.test(lower)) os = "Linux";

  let browser = "Ukjent";
  if (/edg\//.test(lower)) browser = "Edge";
  else if (/opr\/|opera/.test(lower)) browser = "Opera";
  else if (/chrome\//.test(lower) && !/chromium/.test(lower)) browser = "Chrome";
  else if (/firefox\//.test(lower)) browser = "Firefox";
  else if (/safari\//.test(lower) && !/chrome/.test(lower)) browser = "Safari";

  return { deviceType, os, browser };
}

async function lookupGeo(ip: string | null): Promise<GeoInfo> {
  const empty: GeoInfo = {
    ip,
    city: null,
    region: null,
    country: null,
    countryCode: null,
    latitude: null,
    longitude: null,
    timezone: null,
    isp: null,
  };
  if (!ip) return empty;
  // Skip private/local IPs
  if (
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("fe80:")
  ) {
    return empty;
  }

  try {
    const res = await loggedFetch(
      "geoip",
      "ip-api",
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,regionName,city,lat,lon,timezone,isp,query`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return empty;
    const json = (await res.json()) as {
      status?: string;
      country?: string;
      countryCode?: string;
      regionName?: string;
      city?: string;
      lat?: number;
      lon?: number;
      timezone?: string;
      isp?: string;
    };
    if (json.status !== "success") return empty;
    return {
      ip,
      city: json.city ?? null,
      region: json.regionName ?? null,
      country: json.country ?? null,
      countryCode: json.countryCode ?? null,
      latitude: typeof json.lat === "number" ? json.lat : null,
      longitude: typeof json.lon === "number" ? json.lon : null,
      timezone: json.timezone ?? null,
      isp: json.isp ?? null,
    };
  } catch {
    return empty;
  }
}

function sanitizeWho(w: unknown): string | null {
  if (typeof w !== "string") return null;
  const trimmed = w.trim();
  if (!trimmed || trimmed.length > 40) return null;
  if (trimmed === "Alle") return null;
  return trimmed;
}

export const startVisitorSession = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      clientSessionId: string;
      referrer: string | null;
      language: string | null;
      screen: string | null;
      path: string;
      title: string | null;
      who?: string | null;
    }) => {
      if (!input?.clientSessionId || typeof input.clientSessionId !== "string") {
        throw new Error("Mangler clientSessionId");
      }
      if (input.clientSessionId.length > 80) throw new Error("Ugyldig clientSessionId");
      return input;
    },
  )
  .handler(async ({ data }) => {
    const req = getRequest();
    const ua = req.headers.get("user-agent") ?? "";
    const ip = parseClientIp();
    const uaInfo = parseUserAgent(ua);
    const geo = await lookupGeo(ip);
    const who = sanitizeWho(data.who);

    // Upsert by client_session_id
    const { data: existing } = await supabaseAdmin
      .from("visitor_sessions" as any)
      .select("id")
      .eq("client_session_id", data.clientSessionId)
      .maybeSingle();

    let sessionId: string;
    if (existing && (existing as any).id) {
      sessionId = (existing as any).id;
      const update: Record<string, any> = { last_seen_at: new Date().toISOString() };
      if (who) update.who = who;
      await supabaseAdmin
        .from("visitor_sessions" as any)
        .update(update)
        .eq("id", sessionId);
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("visitor_sessions" as any)
        .insert({
          client_session_id: data.clientSessionId,
          ip: geo.ip,
          city: geo.city,
          region: geo.region,
          country: geo.country,
          country_code: geo.countryCode,
          latitude: geo.latitude,
          longitude: geo.longitude,
          timezone: geo.timezone,
          isp: geo.isp,
          user_agent: ua.slice(0, 500),
          device_type: uaInfo.deviceType,
          os: uaInfo.os,
          browser: uaInfo.browser,
          referrer: data.referrer ? data.referrer.slice(0, 500) : null,
          language: data.language ? data.language.slice(0, 32) : null,
          screen: data.screen ? data.screen.slice(0, 32) : null,
          who,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      sessionId = (inserted as any).id;
    }

    // Insert first pageview
    const { data: pv, error: pvError } = await supabaseAdmin
      .from("visitor_pageviews" as any)
      .insert({
        session_id: sessionId,
        path: data.path.slice(0, 200),
        title: data.title ? data.title.slice(0, 200) : null,
      })
      .select("id")
      .single();
    if (pvError) throw new Error(pvError.message);

    return { sessionId, pageviewId: (pv as any).id };
  });

export const recordPageview = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { sessionId: string; path: string; title: string | null; who?: string | null }) => {
      if (!input?.sessionId) throw new Error("Mangler sessionId");
      if (input.sessionId.length > 64) throw new Error("Ugyldig sessionId");
      return input;
    },
  )
  .handler(async ({ data }) => {
    const { data: pv, error } = await supabaseAdmin
      .from("visitor_pageviews" as any)
      .insert({
        session_id: data.sessionId,
        path: data.path.slice(0, 200),
        title: data.title ? data.title.slice(0, 200) : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Bump session counters + persist who if provided
    const { data: sess } = await supabaseAdmin
      .from("visitor_sessions" as any)
      .select("pageview_count")
      .eq("id", data.sessionId)
      .maybeSingle();
    const next = ((sess as any)?.pageview_count ?? 0) + 1;
    const update: Record<string, any> = {
      pageview_count: next,
      last_seen_at: new Date().toISOString(),
    };
    const who = sanitizeWho(data.who);
    if (who) update.who = who;
    await supabaseAdmin
      .from("visitor_sessions" as any)
      .update(update)
      .eq("id", data.sessionId);

    return { pageviewId: (pv as any).id };
  });

export const heartbeat = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      sessionId: string;
      pageviewId: string | null;
      pageDurationSeconds: number;
      sessionDurationSeconds: number;
      who?: string | null;
    }) => {
      if (!input?.sessionId) throw new Error("Mangler sessionId");
      return input;
    },
  )
  .handler(async ({ data }) => {
    const now = new Date().toISOString();
    const update: Record<string, any> = {
      last_seen_at: now,
      duration_seconds: Math.max(0, Math.floor(data.sessionDurationSeconds)),
    };
    const who = sanitizeWho(data.who);
    if (who) update.who = who;
    await supabaseAdmin
      .from("visitor_sessions" as any)
      .update(update)
      .eq("id", data.sessionId);
    if (data.pageviewId) {
      await supabaseAdmin
        .from("visitor_pageviews" as any)
        .update({ duration_seconds: Math.max(0, Math.floor(data.pageDurationSeconds)) })
        .eq("id", data.pageviewId);
    }
    return { ok: true };
  });

// logLoginAttempt moved to visitors-log.server.ts to keep this file
// safely importable from client code (server functions get RPC-bridged).

export type VisitorSessionRow = {
  id: string;
  client_session_id: string;
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  isp: string | null;
  user_agent: string | null;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  referrer: string | null;
  language: string | null;
  screen: string | null;
  started_at: string;
  last_seen_at: string;
  duration_seconds: number;
  pageview_count: number;
  who: string | null;
};

export type LoginAttemptRow = {
  id: string;
  attempted_at: string;
  success: boolean;
  ip: string | null;
  city: string | null;
  country: string | null;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  device_type: string | null;
  os: string | null;
  browser: string | null;
};

export type PageviewRow = {
  id: string;
  session_id: string;
  path: string;
  title: string | null;
  entered_at: string;
  duration_seconds: number;
};

export const fetchVakttarnetData = createServerFn({ method: "GET" }).handler(async () => {
  const [
    { data: sessions },
    { data: attempts },
    { data: pageviews },
    { count: totalPageviewsCount },
    { data: allSoulsRows },
  ] = await Promise.all([
    supabaseAdmin
      .from("visitor_sessions" as any)
      .select("*")
      .order("last_seen_at", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("visitor_login_attempts" as any)
      .select("*")
      .order("attempted_at", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("visitor_pageviews" as any)
      .select("*")
      .order("entered_at", { ascending: false })
      .limit(1000),
    // Ekte totalt antall sidevisninger (ikke bare de 1000 nyeste)
    supabaseAdmin
      .from("visitor_pageviews" as any)
      .select("*", { count: "exact", head: true }),
    // Alle økter — bare de to feltene vi trenger for å telle unike sjeler
    supabaseAdmin
      .from("visitor_sessions" as any)
      .select("ip, client_session_id")
      .limit(50000),
  ]);

  return {
    sessions: (sessions ?? []) as unknown as VisitorSessionRow[],
    attempts: (attempts ?? []) as unknown as LoginAttemptRow[],
    pageviews: (pageviews ?? []) as unknown as PageviewRow[],
    totalPageviews: totalPageviewsCount ?? 0,
    totalSouls: uniqueSouls(allSoulsRows as any),
  };
});

/**
 * "Slipp løs hestene" — frees a locked-out IP by deleting all of its failed
 * login attempts in the last 24 hours. The escalation logic in src/server/auth.ts
 * counts failures within this rolling window, so removing them clears the lockout
 * immediately. Successful attempts are left intact for the audit trail.
 *
 * Requires an authenticated session — only the house can free wanderers.
 */
export const releaseIpFn = createServerFn({ method: "POST" })
  .inputValidator((data: { ip: string }) => {
    if (typeof data?.ip !== "string" || data.ip.length === 0 || data.ip.length > 64) {
      throw new Error("Ugyldig IP");
    }
    return { ip: data.ip };
  })
  .handler(async ({ data }) => {
    const session = await useSession<AuthSessionData>(getAuthSessionConfig());
    if (session.data?.authenticated !== true) {
      throw new Error("Bare husets herskere kan slippe løs hestene");
    }
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { error, count } = await supabaseAdmin
      .from("visitor_login_attempts" as any)
      .delete({ count: "exact" })
      .eq("ip", data.ip)
      .eq("success", false)
      .gte("attempted_at", since);
    if (error) throw new Error(error.message);
    return { released: true, removed: count ?? 0, ip: data.ip };
  });

// ── Lite tellverk for forsiden — antall besøkende totalt, i dag og akkurat nå
// Vi teller både unike sjeler (IP/client-session) og rå økter, og legger på
// trender: siste time vs forrige time, i dag vs i går, og siste 24t totalt.
export type VisitorCounts = {
  total: number;
  today: number;
  online: number;
  totalSessions: number;
  todaySessions: number;
  onlineSessions: number;
  // Nye trend-felter
  lastHour: number;          // unike sjeler siste 60 min
  prevHour: number;          // unike sjeler i timen før det
  yesterday: number;         // unike sjeler i går (samme kalenderdag)
  yesterdaySessions: number; // økter i går
  last24h: number;           // unike sjeler siste 24t
  last24hSessions: number;   // økter siste 24t
  totalPageviews: number;    // totalt antall klikk/sidevisninger
};

function uniqueSouls(rows: Array<{ ip: string | null; client_session_id: string }> | null) {
  if (!rows) return 0;
  const seen = new Set<string>();
  for (const r of rows) {
    seen.add(r.ip && r.ip.length > 0 ? `ip:${r.ip}` : `cs:${r.client_session_id}`);
  }
  return seen.size;
}

export const getVisitorCounts = createServerFn({ method: "GET" }).handler(
  async (): Promise<VisitorCounts> => {
    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfDay);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const onlineCutoff = new Date(now - 5 * 60 * 1000).toISOString();
    const lastHourCutoff = new Date(now - 60 * 60 * 1000).toISOString();
    const prevHourStart = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    const last24hCutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    const [
      allRes,
      todayRes,
      onlineRes,
      lastHourRes,
      prevHourRes,
      yesterdayRes,
      last24hRes,
      pvCountRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("visitor_sessions" as any)
        .select("ip, client_session_id")
        .limit(50000),
      supabaseAdmin
        .from("visitor_sessions" as any)
        .select("ip, client_session_id")
        .gte("started_at", startOfDay.toISOString())
        .limit(50000),
      supabaseAdmin
        .from("visitor_sessions" as any)
        .select("ip, client_session_id")
        .gte("last_seen_at", onlineCutoff)
        .limit(50000),
      // Siste time (basert på siste aktivitet)
      supabaseAdmin
        .from("visitor_sessions" as any)
        .select("ip, client_session_id")
        .gte("last_seen_at", lastHourCutoff)
        .limit(50000),
      // Forrige time (mellom -2t og -1t)
      supabaseAdmin
        .from("visitor_sessions" as any)
        .select("ip, client_session_id")
        .gte("last_seen_at", prevHourStart)
        .lt("last_seen_at", lastHourCutoff)
        .limit(50000),
      // I går (kalenderdag)
      supabaseAdmin
        .from("visitor_sessions" as any)
        .select("ip, client_session_id")
        .gte("started_at", startOfYesterday.toISOString())
        .lt("started_at", startOfDay.toISOString())
        .limit(50000),
      // Siste 24t (rullerende)
      supabaseAdmin
        .from("visitor_sessions" as any)
        .select("ip, client_session_id")
        .gte("started_at", last24hCutoff)
        .limit(50000),
      // Totalt antall klikk = pageviews
      supabaseAdmin
        .from("visitor_pageviews" as any)
        .select("*", { count: "exact", head: true }),
    ]);

    return {
      total: uniqueSouls(allRes.data as any),
      today: uniqueSouls(todayRes.data as any),
      online: uniqueSouls(onlineRes.data as any),
      totalSessions: allRes.data?.length ?? 0,
      todaySessions: todayRes.data?.length ?? 0,
      onlineSessions: onlineRes.data?.length ?? 0,
      lastHour: uniqueSouls(lastHourRes.data as any),
      prevHour: uniqueSouls(prevHourRes.data as any),
      yesterday: uniqueSouls(yesterdayRes.data as any),
      yesterdaySessions: yesterdayRes.data?.length ?? 0,
      last24h: uniqueSouls(last24hRes.data as any),
      last24hSessions: last24hRes.data?.length ?? 0,
      totalPageviews: pvCountRes.count ?? 0,
    };
  },
);
