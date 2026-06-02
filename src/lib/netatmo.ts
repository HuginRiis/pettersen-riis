import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
const __load_api_call_log_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/server/api-call-log.server")> => import("@/server/api-call-log.server"))
  .client((): Promise<typeof import("@/server/api-call-log.server")> => Promise.resolve({} as unknown as typeof import("@/server/api-call-log.server")));
const { withApiLog } = await __load_api_call_log_server();
const __load_netatmo_token_store_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/server/netatmo-token-store.server")> => import("@/server/netatmo-token-store.server"))
  .client((): Promise<typeof import("@/server/netatmo-token-store.server")> => Promise.resolve({} as unknown as typeof import("@/server/netatmo-token-store.server")));
const { loadStoredRefreshToken, saveStoredRefreshToken } = await __load_netatmo_token_store_server();
const REFRESH_TOKEN_KEY = "netatmo_refresh_token";

const NETATMO_BASE = "https://api.netatmo.com";

type TokenCache = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  const clientId = process.env.NETATMO_CLIENT_ID;
  const clientSecret = process.env.NETATMO_CLIENT_SECRET;
  const initialRefresh = process.env.NETATMO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !initialRefresh) {
    throw new Error("NETATMO_CLIENT_ID/SECRET/REFRESH_TOKEN mangler");
  }

  if (tokenCache && tokenCache.expiresAt - Date.now() > 60_000) {
    return tokenCache.accessToken;
  }

  const stored = await loadStoredRefreshToken(REFRESH_TOKEN_KEY);
  const refreshToken = tokenCache?.refreshToken ?? stored ?? initialRefresh;

  const res = await fetch(`${NETATMO_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Netatmo token-feil (${res.status}): ${text.slice(0, 200)}`);
  }

  const tok = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  tokenCache = {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: Date.now() + tok.expires_in * 1000,
  };

  await saveStoredRefreshToken(REFRESH_TOKEN_KEY, tok.refresh_token);

  return tokenCache.accessToken;
}

export type NetatmoCameraResult =
  | { ok: false; error: string }
  | { ok: true; dataUrl: string; deviceName: string; capturedAt: string };

async function fetchJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${url} feilet (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

function bufferToDataUrl(buffer: ArrayBuffer, contentType: string) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

// Per-kamera snapshot-cache. Netatmo-kameraet leverer ~1 fps internt og
// vi vil unngå at flere klienter spør samtidig (f.eks. iPad + telefon).
const SNAP_TTL_MS = 3_500;
const snapCache = new Map<string, { at: number; data: NetatmoCameraResult }>();

async function getCameraSnapshot(match: string): Promise<NetatmoCameraResult> {
  const key = match.toLowerCase().trim();
  const cached = snapCache.get(key);
  if (cached && Date.now() - cached.at < SNAP_TTL_MS && cached.data.ok) {
    return cached.data;
  }

  try {
    const token = await getAccessToken();

    const home = await fetchJson<any>(
      `${NETATMO_BASE}/api/gethomedata?size=1`,
      token,
    );

    const homes: any[] = home?.body?.homes ?? [];
    const cameras: any[] = [];
    for (const h of homes) {
      for (const c of h.cameras ?? []) {
        cameras.push({ ...c, _homeName: h.name });
      }
    }

    if (cameras.length === 0) {
      return { ok: false, error: "Fant ingen Netatmo-kameraer på kontoen" };
    }

    const cam =
      cameras.find((c) =>
        typeof c.name === "string" ? c.name.toLowerCase().includes(key) : false,
      ) ?? cameras[0];

    const vpn: string | undefined = cam.vpn_url;
    if (!vpn) {
      return { ok: false, error: `Kamera "${cam.name}" mangler vpn_url (offline?)` };
    }

    const snapUrl = `${vpn.replace(/\/+$/, "")}/live/snapshot_720.jpg`;
    const snapRes = await fetch(snapUrl);
    if (!snapRes.ok) {
      // 429 / midlertidig feil → fall tilbake til siste cache hvis mulig
      if (cached?.data.ok) return cached.data;
      return { ok: false, error: `Snapshot feilet (${snapRes.status})` };
    }

    const contentType = snapRes.headers.get("content-type") ?? "image/jpeg";
    const buffer = await snapRes.arrayBuffer();

    const out: NetatmoCameraResult = {
      ok: true,
      dataUrl: bufferToDataUrl(buffer, contentType),
      deviceName: cam.name ?? "Netatmo",
      capturedAt: new Date().toISOString(),
    };
    snapCache.set(key, { at: Date.now(), data: out });
    return out;
  } catch (e: any) {
    if (cached?.data.ok) return cached.data;
    return { ok: false, error: e?.message ?? "Ukjent feil" };
  }
}

export const getNetatmoCameraSnapshot = createServerFn({ method: "GET" })
  .inputValidator((data: { match?: string }) => data ?? {})
  .handler(
    withApiLog("netatmo", "getNetatmoCameraSnapshot", async ({ data }: { data: { match?: string } }) => {
      const match = (data?.match ?? "tollnes").toLowerCase().trim();
      return await getCameraSnapshot(match);
    }),
  );

// Bakoverkompatibel: Tollnes-spesifikk
export const getNetatmoTollnesSnapshot = createServerFn({ method: "GET" }).handler(
  withApiLog("netatmo", "getNetatmoTollnesSnapshot", async (): Promise<NetatmoCameraResult> => {
    return await getCameraSnapshot("tollnes");
  }),
);
