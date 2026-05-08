/**
 * Garmin Connect klient.
 *
 * Implementerer SSO + OAuth1 → OAuth2 flyten Garmin Mobile bruker
 * (samme som python-biblioteket "garth"), kun med native fetch og
 * Web Crypto. Tokens lagres i `garmin_tokens`-tabellen og fornyes
 * automatisk når access-token har <60s igjen.
 *
 * VIKTIG: Dette er uoffisiell skraping — bryter Garmins TOS.
 * MFA støttes ikke (krever interaktiv kode). Slå MFA av på kontoen.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SSO = "https://sso.garmin.com/sso";
const SSO_EMBED = `${SSO}/embed`;
const LOGIN_URL = `${SSO}/signin`;
const API = "https://connectapi.garmin.com";
const USER_AGENT = "com.garmin.android.apps.connectmobile";

// Public OAuth1 consumer credentials (samme som Garmin sin Android-app).
const CONSUMER_KEY = "fc3e99d2-118c-44b8-8ae3-03370dde24c0";
const CONSUMER_SECRET = "E08WAR897WEy2knn7aFBrvegVAf0AFdWBBF";

const SIGNIN_PARAMS: Record<string, string> = {
  id: "gauth-widget",
  embedWidget: "true",
  gauthHost: SSO_EMBED,
  service: SSO_EMBED,
  source: SSO_EMBED,
  redirectAfterAccountLoginUrl: SSO_EMBED,
  redirectAfterAccountCreationUrl: SSO_EMBED,
};

// ----- Cookie jar -----------------------------------------------------------

type Jar = Map<string, string>;

function jarHeader(jar: Jar): string | undefined {
  if (jar.size === 0) return undefined;
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

function ingest(jar: Jar, res: Response) {
  // Workers Fetch returnerer setCookie via getSetCookie()
  const arr = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.()
    ?? [...res.headers.entries()].filter(([k]) => k.toLowerCase() === "set-cookie").map(([, v]) => v);
  for (const raw of arr) {
    const m = raw.match(/^([^=]+)=([^;]*)/);
    if (!m) continue;
    const name = m[1].trim();
    const value = m[2];
    if (/expires=[^;]*1970/i.test(raw) || /max-age=0/i.test(raw)) {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
}

async function jfetch(jar: Jar, url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("User-Agent", USER_AGENT);
  const cookie = jarHeader(jar);
  if (cookie) headers.set("Cookie", cookie);
  const res = await fetch(url, { ...init, headers, redirect: "manual" });
  ingest(jar, res);
  // Manuell follow for 3xx
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (loc) {
      const next = new URL(loc, url).toString();
      return jfetch(jar, next, { method: "GET" });
    }
  }
  return res;
}

// ----- OAuth1 signering -----------------------------------------------------

function pctEnc(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

async function hmacSha1B64(key: string, text: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(text));
  let bin = "";
  const bytes = new Uint8Array(sig);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function nonce(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

async function oauth1Header(
  method: string,
  url: string,
  extraParams: Record<string, string>,
  consumerKey: string,
  consumerSecret: string,
  token?: string,
  tokenSecret?: string,
): Promise<string> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
  };
  if (token) oauthParams.oauth_token = token;

  const u = new URL(url);
  const qsParams: Record<string, string> = {};
  u.searchParams.forEach((v, k) => { qsParams[k] = v; });
  const baseUrl = `${u.origin}${u.pathname}`;

  const all: Record<string, string> = { ...qsParams, ...extraParams, ...oauthParams };
  const sortedKv = Object.keys(all).sort()
    .map((k) => `${pctEnc(k)}=${pctEnc(all[k])}`).join("&");
  const baseString = `${method.toUpperCase()}&${pctEnc(baseUrl)}&${pctEnc(sortedKv)}`;
  const signingKey = `${pctEnc(consumerSecret)}&${pctEnc(tokenSecret || "")}`;
  const signature = await hmacSha1B64(signingKey, baseString);

  const authParams: Record<string, string> = { ...oauthParams, oauth_signature: signature };
  return "OAuth " + Object.keys(authParams).sort()
    .map((k) => `${pctEnc(k)}="${pctEnc(authParams[k])}"`)
    .join(", ");
}

// ----- Token-modell ---------------------------------------------------------

export type GarminTokens = {
  oauth1_token: string;
  oauth1_secret: string;
  oauth2_token: string;
  oauth2_refresh_token: string | null;
  oauth2_expires_at: string; // ISO
};

async function loadTokens(): Promise<GarminTokens | null> {
  const { data } = await supabaseAdmin
    .from("garmin_tokens")
    .select("oauth1_token, oauth1_secret, oauth2_token, oauth2_refresh_token, oauth2_expires_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.oauth1_token || !data?.oauth1_secret) return null;
  return data as unknown as GarminTokens;
}

async function saveTokens(t: Partial<GarminTokens> & { username?: string }) {
  const { data: existing } = await supabaseAdmin
    .from("garmin_tokens")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const patch = {
    ...t,
    last_login_at: t.oauth1_token ? new Date().toISOString() : undefined,
    updated_at: new Date().toISOString(),
  };
  if (existing?.id) {
    await supabaseAdmin.from("garmin_tokens").update(patch).eq("id", existing.id);
  } else {
    await supabaseAdmin.from("garmin_tokens").insert(patch);
  }
}

// ----- SSO + OAuth1/2 flyten ------------------------------------------------

async function fullLogin(): Promise<GarminTokens> {
  const email = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;
  if (!email || !password) throw new Error("GARMIN_EMAIL / GARMIN_PASSWORD ikke satt.");

  const jar: Jar = new Map();

  // 1. Etablér session på embed
  await jfetch(jar, `${SSO_EMBED}?${new URLSearchParams({
    id: "gauth-widget", embedWidget: "true", gauthHost: SSO_EMBED,
  })}`);

  // 2. Hent CSRF
  const signinUrl = `${LOGIN_URL}?${new URLSearchParams(SIGNIN_PARAMS)}`;
  const csrfRes = await jfetch(jar, signinUrl, {
    headers: { Referer: SSO_EMBED, Accept: "text/html" },
  });
  const csrfHtml = await csrfRes.text();
  const csrfMatch = csrfHtml.match(/name="_csrf"\s+value="([^"]+)"/);
  if (!csrfMatch) throw new Error("Fant ikke _csrf på Garmin signin-side.");
  const csrf = csrfMatch[1];

  // 3. POST credentials
  const form = new URLSearchParams({
    username: email, password, embed: "true", _csrf: csrf,
  });
  const postRes = await jfetch(jar, signinUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: signinUrl,
      Accept: "text/html",
    },
    body: form.toString(),
  });
  const body = await postRes.text();
  const ticketMatch = body.match(/embed\?ticket=([^"&]+)/) ?? body.match(/ticket=([^"&]+)/);
  if (!ticketMatch) {
    if (/MFA/i.test(body) || /two-factor/i.test(body)) {
      throw new Error("Garmin krever MFA — slå av to-trinns-bekreftelse for å bruke denne integrasjonen.");
    }
    throw new Error(`Innlogging feilet (ingen ticket). Sjekk e-post/passord. HTTP ${postRes.status}.`);
  }
  const ticket = ticketMatch[1];

  // 4. Hent OAuth1-token via preauthorized
  const preauthUrl = `${API}/oauth-service/oauth/preauthorized?${new URLSearchParams({
    ticket, "login-url": SSO_EMBED, "accepts-mfa-tokens": "true",
  })}`;
  const auth1 = await oauth1Header("GET", preauthUrl, {}, CONSUMER_KEY, CONSUMER_SECRET);
  const oauth1Res = await fetch(preauthUrl, {
    headers: { Authorization: auth1, "User-Agent": USER_AGENT },
  });
  if (!oauth1Res.ok) {
    throw new Error(`OAuth1 preauthorized feilet: ${oauth1Res.status} ${await oauth1Res.text()}`);
  }
  const oauth1Body = await oauth1Res.text();
  const o1 = new URLSearchParams(oauth1Body);
  const oauth1_token = o1.get("oauth_token");
  const oauth1_secret = o1.get("oauth_token_secret");
  if (!oauth1_token || !oauth1_secret) throw new Error("Mottok ikke OAuth1-token fra Garmin.");

  // 5. Bytt OAuth1 → OAuth2
  const exchUrl = `${API}/oauth-service/oauth/exchange/user/2.0`;
  const exchAuth = await oauth1Header("POST", exchUrl, {}, CONSUMER_KEY, CONSUMER_SECRET, oauth1_token, oauth1_secret);
  const exchRes = await fetch(exchUrl, {
    method: "POST",
    headers: {
      Authorization: exchAuth,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
  });
  if (!exchRes.ok) {
    throw new Error(`OAuth2 exchange feilet: ${exchRes.status} ${await exchRes.text()}`);
  }
  const oauth2 = (await exchRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const tokens: GarminTokens = {
    oauth1_token,
    oauth1_secret,
    oauth2_token: oauth2.access_token,
    oauth2_refresh_token: oauth2.refresh_token ?? null,
    oauth2_expires_at: new Date(Date.now() + (oauth2.expires_in - 30) * 1000).toISOString(),
  };
  await saveTokens({ ...tokens, username: email });
  return tokens;
}

async function refreshOauth2(t: GarminTokens): Promise<GarminTokens> {
  const exchUrl = `${API}/oauth-service/oauth/exchange/user/2.0`;
  const exchAuth = await oauth1Header(
    "POST", exchUrl, {}, CONSUMER_KEY, CONSUMER_SECRET,
    t.oauth1_token, t.oauth1_secret,
  );
  const res = await fetch(exchUrl, {
    method: "POST",
    headers: {
      Authorization: exchAuth,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) {
    // OAuth1-token kan være utløpt — full re-login
    return fullLogin();
  }
  const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  const next: GarminTokens = {
    ...t,
    oauth2_token: j.access_token,
    oauth2_refresh_token: j.refresh_token ?? t.oauth2_refresh_token,
    oauth2_expires_at: new Date(Date.now() + (j.expires_in - 30) * 1000).toISOString(),
  };
  await saveTokens(next);
  return next;
}

async function ensureValid(): Promise<GarminTokens> {
  let t = await loadTokens();
  if (!t) return fullLogin();
  if (new Date(t.oauth2_expires_at).getTime() < Date.now() + 60_000) {
    t = await refreshOauth2(t);
  }
  return t;
}

// ----- API-helper -----------------------------------------------------------

export async function garminGet<T = unknown>(path: string): Promise<T> {
  let t = await ensureValid();
  const url = path.startsWith("http") ? path : `${API}${path}`;
  let res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${t.oauth2_token}`,
      "User-Agent": USER_AGENT,
      "Di-Backend": "connectapi.garmin.com",
      Accept: "application/json",
    },
  });
  if (res.status === 401) {
    t = await refreshOauth2(t);
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${t.oauth2_token}`,
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });
  }
  if (!res.ok) {
    throw new Error(`Garmin API ${res.status} for ${path}: ${(await res.text()).slice(0, 240)}`);
  }
  return res.json() as Promise<T>;
}

export async function garminLogin(): Promise<{ ok: true; expires_at: string }> {
  const t = await fullLogin();
  return { ok: true, expires_at: t.oauth2_expires_at };
}

export async function getGarminStatus(): Promise<{
  connected: boolean;
  username: string | null;
  expires_at: string | null;
  last_login_at: string | null;
}> {
  const { data } = await supabaseAdmin
    .from("garmin_tokens")
    .select("username, oauth2_expires_at, last_login_at, oauth1_token")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    connected: !!data?.oauth1_token,
    username: data?.username ?? null,
    expires_at: data?.oauth2_expires_at ?? null,
    last_login_at: data?.last_login_at ?? null,
  };
}
