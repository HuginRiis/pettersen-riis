/**
 * Garmin Connect klient med MFA-støtte.
 *
 * Implementerer SSO + OAuth1 → OAuth2 flyten Garmin Mobile bruker.
 * Hvis kontoen krever MFA (sikkerhetskode på e-post / authenticator),
 * returnerer login `{ status: "mfa" }` og lagrer mellomtilstand i
 * `garmin_tokens.pending_mfa`. Brukeren skriver inn koden i UI og
 * `submitGarminMfa(code)` fullfører flyten.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SSO = "https://sso.garmin.com/sso";
const SSO_EMBED = `${SSO}/embed`;
const LOGIN_URL = `${SSO}/signin`;
const API = "https://connectapi.garmin.com";
const USER_AGENT = "com.garmin.android.apps.connectmobile";

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
  oauth2_expires_at: string;
};

type PendingMfa = {
  jar: [string, string][];
  csrf: string;
  mfa_url: string;
  signin_url: string;
  created_at: string;
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

async function saveTokens(t: Partial<GarminTokens> & { username?: string; pending_mfa?: PendingMfa | null }) {
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

async function loadPendingMfa(): Promise<PendingMfa | null> {
  const { data } = await supabaseAdmin
    .from("garmin_tokens")
    .select("pending_mfa")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data as { pending_mfa?: PendingMfa | null } | null)?.pending_mfa) ?? null;
}

// ----- SSO + OAuth1/2 flyten ------------------------------------------------

function extractTicket(body: string): string | null {
  const m = body.match(/embed\?ticket=([^"&]+)/) ?? body.match(/ticket=([^"&]+)/);
  return m ? m[1] : null;
}

function extractMfaForm(body: string): { actionPath: string; csrf: string } | null {
  // Garmin MFA-skjema poster til /sso/verifyMFA/loginEnterMfaCode/...
  // form-attributter kan komme i ulik rekkefølge → match på action uavhengig av posisjon.
  const action =
    body.match(/<form[^>]*\baction\s*=\s*"([^"]*(?:verifyMFA|verify_mfa|mfa-code|mfaCode|loginEnterMfaCode)[^"]*)"/i) ??
    body.match(/<form[^>]*\baction\s*=\s*"([^"]*verify[^"]*)"/i);
  const csrf = body.match(/name="_csrf"\s+value="([^"]+)"/);
  if (!action || !csrf) return null;
  return { actionPath: action[1].replace(/&amp;/g, "&"), csrf: csrf[1] };
}

function looksLikeMfa(body: string): boolean {
  return /verifyMFA|loginEnterMfaCode|mfa-code|mfaCode|two[-\s]?factor|sikkerhetskode|security code/i.test(body);
}

async function exchangeTicketForTokens(ticket: string, email: string): Promise<GarminTokens> {
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
  const o1 = new URLSearchParams(await oauth1Res.text());
  const oauth1_token = o1.get("oauth_token");
  const oauth1_secret = o1.get("oauth_token_secret");
  if (!oauth1_token || !oauth1_secret) throw new Error("Mottok ikke OAuth1-token fra Garmin.");

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
  if (!exchRes.ok) throw new Error(`OAuth2 exchange feilet: ${exchRes.status} ${await exchRes.text()}`);
  const oauth2 = (await exchRes.json()) as { access_token: string; refresh_token?: string; expires_in: number };

  const tokens: GarminTokens = {
    oauth1_token, oauth1_secret,
    oauth2_token: oauth2.access_token,
    oauth2_refresh_token: oauth2.refresh_token ?? null,
    oauth2_expires_at: new Date(Date.now() + (oauth2.expires_in - 30) * 1000).toISOString(),
  };
  await saveTokens({ ...tokens, username: email, pending_mfa: null });
  return tokens;
}

async function startLoginFlow(): Promise<
  { status: "ok"; tokens: GarminTokens } | { status: "mfa" } | { status: "rate_limited"; retryAfterSeconds: number }
> {
  const email = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;
  if (!email || !password) throw new Error("GARMIN_EMAIL / GARMIN_PASSWORD ikke satt.");

  const jar: Jar = new Map();
  // Garmin SSO krever NK=NT-cookien (settes normalt av JS-widgeten).
  // Uten denne svarer SSO 429 selv på første forsøk fra serverside-klienter.
  jar.set("NK", "NT");

  await jfetch(jar, `${SSO_EMBED}?${new URLSearchParams(SIGNIN_PARAMS)}`, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  const signinUrl = `${LOGIN_URL}?${new URLSearchParams(SIGNIN_PARAMS)}`;
  const csrfRes = await jfetch(jar, signinUrl, {
    headers: {
      Referer: SSO_EMBED,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  const csrfHtml = await csrfRes.text();
  const csrfMatch = csrfHtml.match(/name="_csrf"\s+value="([^"]+)"/);
  if (!csrfMatch) throw new Error("Fant ikke _csrf på Garmin signin-side.");
  const csrf = csrfMatch[1];

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

  if (postRes.status === 429) {
    const retryAfter = Number(postRes.headers.get("retry-after"));
    const retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 15 * 60;
    await saveTokens({ pending_mfa: null });
    console.error("[garmin] login rate limited", body.replace(/\s+/g, " ").slice(0, 300));
    return { status: "rate_limited", retryAfterSeconds };
  }

  const ticket = extractTicket(body);
  if (ticket) {
    const tokens = await exchangeTicketForTokens(ticket, email);
    return { status: "ok", tokens };
  }

  let mfa = extractMfaForm(body);
  if (!mfa && looksLikeMfa(body)) {
    // Fallback: prøv å plukke flow-key fra body og bruk eksisterende csrf
    const keyMatch = body.match(/loginEnterMfaCode\/([A-Za-z0-9_-]+)/);
    const csrfBody = body.match(/name="_csrf"\s+value="([^"]+)"/);
    if (keyMatch && csrfBody) {
      mfa = {
        actionPath: `/sso/verifyMFA/loginEnterMfaCode/${keyMatch[1]}?${new URLSearchParams(SIGNIN_PARAMS)}`,
        csrf: csrfBody[1],
      };
    } else if (csrfBody) {
      // Siste utvei: bruk samme signin URL — Garmin aksepterer mfa-code dit i noen flyter
      mfa = { actionPath: signinUrl, csrf: csrfBody[1] };
    }
  }
  if (mfa) {
    const mfaUrl = mfa.actionPath.startsWith("http")
      ? mfa.actionPath
      : new URL(mfa.actionPath, SSO + "/").toString();
    const pending: PendingMfa = {
      jar: Array.from(jar.entries()),
      csrf: mfa.csrf,
      mfa_url: mfaUrl,
      signin_url: signinUrl,
      created_at: new Date().toISOString(),
    };
    await saveTokens({ pending_mfa: pending });
    return { status: "mfa" };
  }

  // Diagnostikk — skriv ut snippet så vi kan se hva Garmin faktisk returnerte
  console.error("[garmin] login: ingen ticket/MFA. status=", postRes.status, "snippet=", body.replace(/\s+/g, " ").slice(0, 600));
  throw new Error(`Innlogging feilet (ingen ticket / MFA-form). HTTP ${postRes.status}. Sjekk e-post/passord eller server-logg.`);
}

async function finishLoginWithMfa(code: string): Promise<GarminTokens> {
  const email = process.env.GARMIN_EMAIL;
  if (!email) throw new Error("GARMIN_EMAIL ikke satt.");
  const pending = await loadPendingMfa();
  if (!pending) throw new Error("Ingen aktiv MFA-prosess. Trykk 'Logg inn' på nytt.");

  const ageMs = Date.now() - new Date(pending.created_at).getTime();
  if (ageMs > 10 * 60 * 1000) {
    await saveTokens({ pending_mfa: null });
    throw new Error("MFA-koden gikk ut. Trykk 'Logg inn' på nytt for å få ny kode.");
  }

  const jar: Jar = new Map(pending.jar);
  const form = new URLSearchParams({
    "mfa-code": code.trim(),
    embed: "true",
    _csrf: pending.csrf,
    fromPage: "setupEnterMfaCode",
  });

  const res = await jfetch(jar, pending.mfa_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: pending.signin_url,
      Accept: "text/html",
    },
    body: form.toString(),
  });
  const body = await res.text();
  const ticket = extractTicket(body);
  if (!ticket) {
    if (/incorrect|invalid|feil/i.test(body)) {
      throw new Error("Ugyldig sikkerhetskode. Prøv på nytt.");
    }
    throw new Error(`Fant ikke ticket etter MFA. HTTP ${res.status}.`);
  }
  return exchangeTicketForTokens(ticket, email);
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
    // OAuth1 utløpt — vi kan ikke gjøre full re-login her hvis MFA kreves.
    throw new Error("Garmin-token utløpt. Gå til Trening og trykk 'Logg inn' på nytt.");
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
  const t = await loadTokens();
  if (!t) throw new Error("Ikke logget inn på Garmin. Gå til Trening og trykk 'Logg inn'.");
  if (new Date(t.oauth2_expires_at).getTime() < Date.now() + 60_000) {
    return refreshOauth2(t);
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

export async function garminLogin(): Promise<
  | { ok: true; mfa: false; expires_at: string }
  | { ok: true; mfa: true }
  | { ok: false; mfa: false; rateLimited: true; retryAfterSeconds: number; message: string }
> {
  const r = await startLoginFlow();
  if (r.status === "rate_limited") {
    const minutes = Math.max(1, Math.ceil(r.retryAfterSeconds / 60));
    return {
      ok: false,
      mfa: false,
      rateLimited: true,
      retryAfterSeconds: r.retryAfterSeconds,
      message: `Garmin stopper innlogging midlertidig etter flere forsøk. Vent ca. ${minutes} min før du prøver igjen.`,
    };
  }
  if (r.status === "mfa") return { ok: true, mfa: true };
  return { ok: true, mfa: false, expires_at: r.tokens.oauth2_expires_at };
}

export async function garminSubmitMfa(code: string): Promise<{ ok: true; expires_at: string }> {
  const t = await finishLoginWithMfa(code);
  return { ok: true, expires_at: t.oauth2_expires_at };
}

export async function getGarminStatus(): Promise<{
  connected: boolean;
  username: string | null;
  expires_at: string | null;
  last_login_at: string | null;
  mfa_pending: boolean;
}> {
  const { data } = await supabaseAdmin
    .from("garmin_tokens")
    .select("username, oauth2_expires_at, last_login_at, oauth1_token, pending_mfa")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    connected: !!data?.oauth1_token,
    username: data?.username ?? null,
    expires_at: data?.oauth2_expires_at ?? null,
    last_login_at: data?.last_login_at ?? null,
    mfa_pending: !!(data as { pending_mfa?: unknown } | null)?.pending_mfa,
  };
}
