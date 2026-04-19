import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function parseClientIpFromHeaders(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf;
  const real = headers.get("x-real-ip");
  if (real) return real;
  return null;
}

function parseUserAgent(ua: string) {
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

async function lookupGeo(ip: string | null) {
  const empty = {
    ip,
    city: null as string | null,
    region: null as string | null,
    country: null as string | null,
    countryCode: null as string | null,
    latitude: null as number | null,
    longitude: null as number | null,
  };
  if (!ip) return empty;
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
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,lat,lon,query`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return empty;
    const json = (await res.json()) as any;
    if (json.status !== "success") return empty;
    return {
      ip,
      city: json.city ?? null,
      region: json.regionName ?? null,
      country: json.country ?? null,
      countryCode: json.countryCode ?? null,
      latitude: typeof json.lat === "number" ? json.lat : null,
      longitude: typeof json.lon === "number" ? json.lon : null,
    };
  } catch {
    return empty;
  }
}

export async function logLoginAttempt(success: boolean) {
  try {
    const req = getRequest();
    const ua = req.headers.get("user-agent") ?? "";
    const ip = parseClientIpFromHeaders(req.headers);
    const uaInfo = parseUserAgent(ua);
    const geo = await lookupGeo(ip);
    await supabaseAdmin.from("visitor_login_attempts" as any).insert({
      success,
      ip: geo.ip,
      city: geo.city,
      region: geo.region,
      country: geo.country,
      country_code: geo.countryCode,
      latitude: geo.latitude,
      longitude: geo.longitude,
      user_agent: ua.slice(0, 500),
      device_type: uaInfo.deviceType,
      os: uaInfo.os,
      browser: uaInfo.browser,
    });
  } catch {
    // never fail login flow because of analytics
  }
}
