import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeader, useSession } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
    const res = await fetch(
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

export const startVisitorSession = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      clientSessionId: string;
      referrer: string | null;
      language: string | null;
      screen: string | null;
      path: string;
      title: string | null;
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

    // Upsert by client_session_id
    const { data: existing } = await supabaseAdmin
      .from("visitor_sessions" as any)
      .select("id")
      .eq("client_session_id", data.clientSessionId)
      .maybeSingle();

    let sessionId: string;
    if (existing && (existing as any).id) {
      sessionId = (existing as any).id;
      await supabaseAdmin
        .from("visitor_sessions" as any)
        .update({ last_seen_at: new Date().toISOString() })
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
    (input: { sessionId: string; path: string; title: string | null }) => {
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

    // Bump session counters
    const { data: sess } = await supabaseAdmin
      .from("visitor_sessions" as any)
      .select("pageview_count")
      .eq("id", data.sessionId)
      .maybeSingle();
    const next = ((sess as any)?.pageview_count ?? 0) + 1;
    await supabaseAdmin
      .from("visitor_sessions" as any)
      .update({ pageview_count: next, last_seen_at: new Date().toISOString() })
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
    }) => {
      if (!input?.sessionId) throw new Error("Mangler sessionId");
      return input;
    },
  )
  .handler(async ({ data }) => {
    const now = new Date().toISOString();
    await supabaseAdmin
      .from("visitor_sessions" as any)
      .update({
        last_seen_at: now,
        duration_seconds: Math.max(0, Math.floor(data.sessionDurationSeconds)),
      })
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
  const [{ data: sessions }, { data: attempts }, { data: pageviews }] = await Promise.all([
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
  ]);

  return {
    sessions: (sessions ?? []) as unknown as VisitorSessionRow[],
    attempts: (attempts ?? []) as unknown as LoginAttemptRow[],
    pageviews: (pageviews ?? []) as unknown as PageviewRow[],
  };
});
