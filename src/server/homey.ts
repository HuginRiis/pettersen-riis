import { createServerFn } from "@tanstack/react-start";
import {
  deleteHomeyConnection,
  getHomeyConnection,
  updateHomeyTokens,
  type HomeyConnection,
} from "./homey-connection";

export const HOMEY_SCOPES = ["homey", "homey.device.readonly"];

const ATHOM_API_BASE = "https://api.athom.com";

// In-memory cache of Homey session tokens (per Homey id)
const sessionCache = new Map<string, { token: string; expiresAt: number }>();

async function refreshAccessToken(conn: HomeyConnection): Promise<HomeyConnection> {
  const clientId = process.env.HOMEY_CLIENT_ID;
  const clientSecret = process.env.HOMEY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("HOMEY_CLIENT_ID/SECRET mangler på serveren");
  }
  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(`${ATHOM_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kunne ikke fornye token (${res.status}): ${text.slice(0, 200)}`);
  }
  const tok = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string;
  };
  const expiresAt = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString();
  await updateHomeyTokens(conn.id, {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: expiresAt,
    scope: tok.scope ?? conn.scope ?? null,
  });
  return {
    ...conn,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: expiresAt,
    scope: tok.scope ?? conn.scope ?? null,
  };
}

async function getValidConnection(): Promise<HomeyConnection | null> {
  const conn = await getHomeyConnection();
  if (!conn) return null;
  const expiresMs = new Date(conn.expires_at).getTime();
  if (expiresMs - Date.now() < 60_000) {
    return await refreshAccessToken(conn);
  }
  return conn;
}

async function athom<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${ATHOM_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Athom ${path} feilet (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export type HomeyCapValue = string | number | boolean | null;

export type HomeyDeviceSnapshot = {
  id: string;
  name: string;
  class?: string;
  zone?: string | null;
  available?: boolean;
  capabilities: Record<string, { value: HomeyCapValue }>;
};

export type HomeyZone = { id: string; name: string };

export type HomeySnapshot =
  | { ok: false; needsConnect: true; error?: undefined }
  | { ok: false; needsConnect: false; error: string }
  | {
      ok: true;
      homeName: string | null;
      zones: HomeyZone[];
      devices: HomeyDeviceSnapshot[];
    };

export const getHomeySnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<HomeySnapshot> => {
    let conn: HomeyConnection | null;
    try {
      conn = await getValidConnection();
    } catch (e: any) {
      return { ok: false, needsConnect: false, error: e?.message ?? "Token-feil" };
    }
    if (!conn) return { ok: false, needsConnect: true };

    try {
      // Athom CloudAPI: GET /user/me returns the user object with `homeys` map.
      const me = await athom<any>(`/user/me`, conn.access_token);
      const rawHomeys = me?.homeys ?? me?.user?.homeys ?? null;
      let list: AthomHomey[] = [];
      if (Array.isArray(rawHomeys)) {
        list = rawHomeys;
      } else if (rawHomeys && typeof rawHomeys === "object") {
        list = Object.values(rawHomeys) as AthomHomey[];
      }
      const homey = list[0] ?? null;
      if (!homey) {
        return {
          ok: false,
          needsConnect: false,
          error: `Fant ingen Homey på kontoen (bruker: ${me?.firstname ?? me?.email ?? "ukjent"}).`,
        };
      }

      const sessionToken = await getHomeySessionToken(homey, conn.access_token);

      const [zonesObj, devicesObj] = await Promise.all([
        homeyApi<Record<string, { id?: string; name: string }>>(
          homey,
          sessionToken,
          `/api/manager/zones`,
        ),
        homeyApi<Record<string, any>>(homey, sessionToken, `/api/manager/devices/device`),
      ]);

      const zones: HomeyZone[] = Object.entries(zonesObj ?? {}).map(([id, z]) => ({
        id: z.id ?? id,
        name: z.name,
      }));

      const devices: HomeyDeviceSnapshot[] = Object.entries(devicesObj ?? {}).map(
        ([id, d]: [string, any]) => {
          const caps: Record<string, { value: HomeyCapValue }> = {};
          const obj = d.capabilitiesObj ?? {};
          for (const [capId, capVal] of Object.entries(obj)) {
            const v = (capVal as any)?.value;
            caps[capId] =
              typeof v === "string" || typeof v === "number" || typeof v === "boolean"
                ? { value: v }
                : { value: null };
          }
          return {
            id: d.id ?? id,
            name: d.name ?? "Ukjent",
            class: d.class,
            zone: d.zone ?? null,
            available: d.available !== false,
            capabilities: caps,
          };
        },
      );

      return {
        ok: true,
        homeName: homey.name ?? null,
        zones,
        devices,
      };
    } catch (e: any) {
      return { ok: false, needsConnect: false, error: e?.message ?? "Klarte ikke hente data" };
    }
  },
);

export const disconnectHomey = createServerFn({ method: "POST" }).handler(async () => {
  await deleteHomeyConnection();
  return { ok: true };
});
