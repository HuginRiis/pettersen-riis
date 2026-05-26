/**
 * Jaguar InControl portal-scraper (cookie-based).
 *
 * Bruker JAGUAR_INCONTROL_COOKIE (kopiert fra nettleseren etter pålogging på
 * https://incontrol.jaguar.com) til å kalle portalens egne AJAX-endepunkter.
 *
 * Dette er en uoffisiell vei rundt at JLR har stengt det vanlige API-et.
 * Cookien utløper typisk 7-14 dager og må fornyes manuelt.
 */

const BASE = "https://incontrol.jaguar.com/jaguar-portal-owner-web";

const COMMON_HEADERS = {
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "nb-NO,nb;q=0.9,en;q=0.8",
  "X-Requested-With": "XMLHttpRequest",
  Referer: "https://incontrol.jaguar.com/jaguar-portal-owner-web/",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

function getCookie(): string {
  const c = process.env.JAGUAR_INCONTROL_COOKIE;
  if (!c) throw new Error("JAGUAR_INCONTROL_COOKIE mangler");
  return c;
}

async function portalFetch(path: string, init?: RequestInit) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    redirect: "manual",
    headers: {
      ...COMMON_HEADERS,
      Cookie: getCookie(),
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

export type ProbeResult = {
  ok: boolean;
  status: number;
  contentType: string | null;
  url: string;
  /** First ~4 KB av response-body, så vi ser hva vi får. */
  bodyPreview: string;
  /** Parset JSON hvis Content-Type var json. */
  json: unknown;
  /** true hvis responsen så ut som en login-redirect / HTML innlogging. */
  looksLikeLogin: boolean;
};

async function probeUrl(url: string): Promise<ProbeResult> {
  try {
    const res = await portalFetch(url);
    const ct = res.headers.get("content-type");
    const text = await res.text();
    const preview = text.slice(0, 4096);
    let json: unknown = null;
    if (ct && ct.includes("application/json")) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    const looksLikeLogin =
      res.status === 302 ||
      res.status === 401 ||
      res.status === 403 ||
      /<form[^>]*login/i.test(preview) ||
      /j_spring_security|saml|signin/i.test(preview);
    return {
      ok: res.ok && !looksLikeLogin,
      status: res.status,
      contentType: ct,
      url,
      bodyPreview: preview,
      json,
      looksLikeLogin,
    };
  } catch (e: any) {
    return {
      ok: false,
      status: 0,
      contentType: null,
      url,
      bodyPreview: e?.message ?? "fetch error",
      json: null,
      looksLikeLogin: false,
    };
  }
}

/**
 * Prøver flere sannsynlige endepunkter slik at vi kan se hvilke som svarer
 * og hvordan dataen ser ut.
 */
export async function probeJaguarPortal(): Promise<{
  cookieConfigured: boolean;
  results: ProbeResult[];
}> {
  const cookieConfigured = !!process.env.JAGUAR_INCONTROL_COOKIE;
  if (!cookieConfigured) {
    return { cookieConfigured: false, results: [] };
  }
  const ts = Date.now();
  const urls = [
    `/ajax/pollvehiclestatus?_=${ts}`,
    `/ajax/vehiclestatus?_=${ts}`,
    `/ajax/vehicle?_=${ts}`,
    `/ajax/vehicles?_=${ts}`,
    `/dashboard/ajax/vehiclestatus?_=${ts}`,
    `/journeys/ajax/here/apikey?_=${ts}`,
  ];
  const results: ProbeResult[] = [];
  for (const u of urls) {
    results.push(await probeUrl(u));
  }
  return { cookieConfigured, results };
}
