import { createServerFn } from "@tanstack/react-start";
import {
  deleteHomeyConnection,
  getHomeyConnection,
  updateHomeyTokens,
  type HomeyConnection,
} from "./homey-connection";

export const HOMEY_SCOPES = ["homey", "homey.device.readonly"];

const ATHOM_API_BASE = "https://api.athom.com";

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

async function snapshotViaPat(pat: string, homeyId: string): Promise<HomeySnapshot> {
  const base = `https://${homeyId}.connect.athom.com/api`;

  try {
    const [systemRaw, zonesRaw, devicesRaw] = await Promise.all([
      fetchJson<any>(`${base}/manager/system/`, pat).catch(() => null),
      fetchJson<any>(`${base}/manager/zones/zone`, pat),
      fetchJson<any>(`${base}/manager/devices/device`, pat),
    ]);

    const homeName: string | null = systemRaw?.hostname ?? systemRaw?.name ?? null;

    const zonesList: any[] = Array.isArray(zonesRaw)
      ? zonesRaw
      : zonesRaw && typeof zonesRaw === "object"
        ? Object.values(zonesRaw)
        : [];
    const zones: HomeyZone[] = zonesList.map((z: any, i: number) => ({
      id: z.id ?? z._id ?? String(i),
      name: z.name ?? "Ukjent sal",
    }));

    const devicesList: any[] = Array.isArray(devicesRaw)
      ? devicesRaw
      : devicesRaw && typeof devicesRaw === "object"
        ? Object.values(devicesRaw)
        : [];

    const devices: HomeyDeviceSnapshot[] = devicesList.map((d: any, i: number) => {
      const caps: Record<string, { value: HomeyCapValue }> = {};
      const obj = d.capabilitiesObj ?? d.capabilities_obj ?? {};
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        for (const [capId, capVal] of Object.entries(obj)) {
          const v = (capVal as any)?.value;
          caps[capId] =
            typeof v === "string" || typeof v === "number" || typeof v === "boolean"
              ? { value: v }
              : { value: null };
        }
      }
      return {
        id: d.id ?? d._id ?? String(i),
        name: d.name ?? "Ukjent",
        class: d.class,
        zone: d.zone ?? null,
        available: d.available !== false,
        capabilities: caps,
      };
    });

    return { ok: true, homeName, zones, devices };
  } catch (e: any) {
    return { ok: false, needsConnect: false, error: e?.message ?? "Klarte ikke hente data" };
  }
}

export const getHomeySnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<HomeySnapshot> => {
    // Prefer PAT if configured — direct access to all devices, no OAuth flow needed.
    const pat = process.env.HOMEY_PAT;
    if (pat && pat.length > 0) {
      return await snapshotViaPat(pat);
    }

    // Fallback: OAuth Web API client
    let conn: HomeyConnection | null;
    try {
      conn = await getValidConnection();
    } catch (e: any) {
      return { ok: false, needsConnect: false, error: e?.message ?? "Token-feil" };
    }
    if (!conn) return { ok: false, needsConnect: true };

    try {
      const [meRaw, zonesRaw, devicesRaw] = await Promise.all([
        fetchJson<any>(`${ATHOM_API_BASE}/user/me`, conn.access_token).catch(() => null),
        fetchJson<any>(`${ATHOM_API_BASE}/me/zones`, conn.access_token).catch(() => null),
        fetchJson<any>(`${ATHOM_API_BASE}/me/devices`, conn.access_token),
      ]);

      const homeysVal = meRaw?.homeys ?? null;
      const firstHomey = Array.isArray(homeysVal)
        ? homeysVal[0]
        : homeysVal && typeof homeysVal === "object"
          ? (Object.values(homeysVal)[0] as any)
          : null;
      const homeName: string | null = firstHomey?.name ?? null;

      const zonesList: any[] = Array.isArray(zonesRaw)
        ? zonesRaw
        : zonesRaw && typeof zonesRaw === "object"
          ? Object.values(zonesRaw)
          : [];
      const zones: HomeyZone[] = zonesList.map((z: any, i: number) => ({
        id: z.id ?? z._id ?? String(i),
        name: z.name ?? "Ukjent sal",
      }));

      const devicesList: any[] = Array.isArray(devicesRaw)
        ? devicesRaw
        : devicesRaw && typeof devicesRaw === "object"
          ? Object.values(devicesRaw)
          : [];

      const devices: HomeyDeviceSnapshot[] = devicesList.map((d: any, i: number) => {
        const caps: Record<string, { value: HomeyCapValue }> = {};
        const obj = d.capabilitiesObj ?? d.capabilities_obj ?? {};
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
          for (const [capId, capVal] of Object.entries(obj)) {
            const v = (capVal as any)?.value;
            caps[capId] =
              typeof v === "string" || typeof v === "number" || typeof v === "boolean"
                ? { value: v }
                : { value: null };
          }
        }
        return {
          id: d.id ?? d._id ?? String(i),
          name: d.name ?? "Ukjent",
          class: d.class,
          zone: d.zone ?? null,
          available: d.available !== false,
          capabilities: caps,
        };
      });

      return { ok: true, homeName, zones, devices };
    } catch (e: any) {
      return { ok: false, needsConnect: false, error: e?.message ?? "Klarte ikke hente data" };
    }
  },
);

export const disconnectHomey = createServerFn({ method: "POST" }).handler(async () => {
  await deleteHomeyConnection();
  return { ok: true };
});
