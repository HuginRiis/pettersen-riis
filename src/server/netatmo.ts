import { createServerFn } from "@tanstack/react-start";

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

  const refreshToken = tokenCache?.refreshToken ?? initialRefresh;

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

export const getNetatmoTollnesSnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<NetatmoCameraResult> => {
    try {
      const token = await getAccessToken();

      // gethomedata returns Welcome (indoor) cameras
      // homesdata + Presence flow uses /api/gethomedata for legacy too
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

      // Prefer camera with "tollnes" in name, else first
      const cam =
        cameras.find((c) =>
          typeof c.name === "string" ? c.name.toLowerCase().includes("tollnes") : false,
        ) ?? cameras[0];

      const vpn: string | undefined = cam.vpn_url;
      if (!vpn) {
        return { ok: false, error: "Kamera mangler vpn_url (er det online?)" };
      }

      // Snapshot URL: vpn_url + /live/snapshot_720.jpg
      const snapUrl = `${vpn.replace(/\/+$/, "")}/live/snapshot_720.jpg`;
      const snapRes = await fetch(snapUrl);
      if (!snapRes.ok) {
        return {
          ok: false,
          error: `Snapshot feilet (${snapRes.status})`,
        };
      }

      const contentType = snapRes.headers.get("content-type") ?? "image/jpeg";
      const buffer = await snapRes.arrayBuffer();

      return {
        ok: true,
        dataUrl: bufferToDataUrl(buffer, contentType),
        deviceName: cam.name ?? "Netatmo",
        capturedAt: new Date().toISOString(),
      };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Ukjent feil" };
    }
  },
);
