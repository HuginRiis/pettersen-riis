import { createServerFn } from "@tanstack/react-start";
import {
  deleteHomeyConnection,
  loadHomeyConnection,
  saveHomeyConnection,
  type StoredHomeyConnection,
} from "@/server/homey-connection";

// Athom OAuth endpoints
const ATHOM_AUTH_BASE = "https://accounts.athom.com";
const ATHOM_API_BASE = "https://api.athom.com";

export const HOMEY_SCOPES = ["homey", "homey.device.readonly", "homey.device.control"];

type HomeyZone = {
  id: string;
  name: string;
  parent?: string | null;
};

export type HomeyCapValue = string | number | boolean | null;

type HomeyCapability = {
  id: string;
  type?: string;
  title?: string;
  units?: string;
  value?: HomeyCapValue;
  getable?: boolean;
  setable?: boolean;
};

type HomeyDevice = {
  id: string;
  name: string;
  zone: string | null;
  zoneName?: string;
  class?: string;
  iconObj?: { url?: string } | null;
  available?: boolean;
  capabilities: Record<string, HomeyCapability>;
};

export type HomeySnapshot =
  | {
      ok: true;
      homeName?: string;
      zones: HomeyZone[];
      devices: HomeyDevice[];
    }
  | {
      ok: false;
      error: string;
      status?: number;
      needsConnect?: boolean;
    };

type StoredConnection = StoredHomeyConnection;

async function loadConnection(): Promise<StoredConnection | null> {
  return loadHomeyConnection();
}

async function refreshAccessToken(conn: StoredConnection): Promise<StoredConnection> {
  const clientId = process.env.HOMEY_CLIENT_ID;
  const clientSecret = process.env.HOMEY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Mangler HOMEY_CLIENT_ID/SECRET");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: conn.refresh_token,
  });

  const res = await fetch(`${ATHOM_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      Accept: "application/json",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Refresh feilet (${res.status}): ${text.slice(0, 200)}`);
  }

  const tok = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const expiresAt = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString();
  const newRefresh = tok.refresh_token ?? conn.refresh_token;

  return saveHomeyConnection({
    access_token: tok.access_token,
    refresh_token: newRefresh,
    expires_at: expiresAt,
    scope: conn.scope ?? null,
    athom_user_id: conn.athom_user_id ?? null,
    athom_user_name: conn.athom_user_name ?? null,
  });
}

async function getValidAccessToken(): Promise<{ token: string; conn: StoredConnection } | null> {
  const conn = await loadConnection();
  if (!conn) return null;
  const expiresMs = new Date(conn.expires_at).getTime();
  if (Number.isFinite(expiresMs) && expiresMs - Date.now() > 30_000) {
    return { token: conn.access_token, conn };
  }
  const refreshed = await refreshAccessToken(conn);
  return { token: refreshed.access_token, conn: refreshed };
}

async function homeyFetch(path: string, token: string) {
  return fetch(`${ATHOM_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}

type HomeyTarget = { base: string; name?: string; sessionToken: string };

// In-memory cache for Homey session tokens (per worker isolate)
const sessionCache = new Map<string, { token: string; expires: number }>();

async function getDelegationToken(accessToken: string): Promise<string> {
  const res = await fetch(`${ATHOM_API_BASE}/delegation/token?audience=homey`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Delegation token feilet (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (typeof data !== "string") {
    throw new Error("Uventet svar fra delegation/token");
  }
  return data;
}

async function loginToHomey(base: string, delegationToken: string): Promise<string> {
  const res = await fetch(`${base}/api/manager/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ token: delegationToken }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Homey-pålogging feilet (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (typeof data !== "string") {
    throw new Error("Uventet svar fra Homey login");
  }
  return data;
}

async function resolveHomeyTarget(
  accessToken: string,
): Promise<HomeyTarget | { error: string; status: number }> {
  const meRes = await homeyFetch("/user/me", accessToken);
  if (!meRes.ok) {
    const text = await meRes.text();
    return { error: `Homey /user/me feilet: ${text.slice(0, 200)}`, status: meRes.status };
  }
  const me = (await meRes.json()) as any;
  const homeys: Array<any> = me?.homeys ?? me?.user?.homeys ?? [];
  if (!homeys.length) {
    return {
      error:
        "Fant ingen Homey på denne Athom-kontoen. Sjekk at Homey er paret med samme konto du logget inn med.",
      status: 404,
    };
  }
  const homey = homeys[0];
  const homeyId: string | undefined = homey._id ?? homey.id;
  const base: string | undefined =
    homey.remoteUrl ?? homey.localUrlSecure ?? homey.localUrl ?? undefined;
  if (!base) {
    return { error: "Homey har ingen tilgjengelig URL.", status: 502 };
  }
  const cleanBase = base.replace(/\/$/, "");

  const cacheKey = homeyId ?? cleanBase;
  const cached = sessionCache.get(cacheKey);
  let sessionToken: string;
  if (cached && cached.expires > Date.now()) {
    sessionToken = cached.token;
  } else {
    const delegation = await getDelegationToken(accessToken);
    sessionToken = await loginToHomey(cleanBase, delegation);
    sessionCache.set(cacheKey, { token: sessionToken, expires: Date.now() + 50 * 60 * 1000 });
  }

  return { base: cleanBase, name: homey.name, sessionToken };
}

export const getHomeyConnectionStatus = createServerFn({ method: "GET" }).handler(async () => {
  const conn = await loadConnection();
  if (!conn) return { connected: false as const };
  return {
    connected: true as const,
    accountName: conn.athom_user_name ?? null,
  };
});

export const getHomeySnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<HomeySnapshot> => {
    const valid = await getValidAccessToken();
    if (!valid) {
      return { ok: false, error: "Homey er ikke koblet til ennå.", needsConnect: true };
    }

    const resolved = await resolveHomeyBase(valid.token);
    if ("error" in resolved) {
      return { ok: false, error: resolved.error, status: resolved.status };
    }

    const [zonesRes, devicesRes] = await Promise.all([
      fetch(`${resolved.base}/api/manager/zones/zone/`, {
        headers: { Authorization: `Bearer ${valid.token}`, Accept: "application/json" },
      }),
      fetch(`${resolved.base}/api/manager/devices/device/`, {
        headers: { Authorization: `Bearer ${valid.token}`, Accept: "application/json" },
      }),
    ]);

    if (!zonesRes.ok || !devicesRes.ok) {
      const status = !zonesRes.ok ? zonesRes.status : devicesRes.status;
      const body = !zonesRes.ok ? await zonesRes.text() : await devicesRes.text();
      return { ok: false, error: `Homey API feilet (${status}): ${body.slice(0, 200)}`, status };
    }

    const zonesRaw = (await zonesRes.json()) as Record<
      string,
      { id: string; name: string; parent?: string | null }
    >;
    const devicesRaw = (await devicesRes.json()) as Record<string, any>;

    const zones: HomeyZone[] = Object.values(zonesRaw).map((z) => ({
      id: z.id,
      name: z.name,
      parent: z.parent ?? null,
    }));
    const zoneNameById = new Map(zones.map((z) => [z.id, z.name]));

    const devices: HomeyDevice[] = Object.values(devicesRaw).map((d) => {
      const caps: Record<string, HomeyCapability> = {};
      const capsObj = d.capabilitiesObj ?? {};
      for (const [capId, cap] of Object.entries<any>(capsObj)) {
        const raw = cap?.value;
        const value: HomeyCapValue =
          raw === null || raw === undefined
            ? null
            : typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean"
              ? raw
              : null;
        caps[capId] = {
          id: capId,
          type: cap?.type,
          title: cap?.title,
          units: cap?.units,
          value,
          getable: cap?.getable,
          setable: cap?.setable,
        };
      }
      return {
        id: d.id,
        name: d.name,
        zone: d.zone ?? null,
        zoneName: d.zone ? zoneNameById.get(d.zone) : undefined,
        class: d.class,
        iconObj: d.iconObj ?? null,
        available: d.available,
        capabilities: caps,
      };
    });

    return { ok: true, homeName: resolved.name, zones, devices };
  },
);

export const setHomeyCapability = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { deviceId: string; capabilityId: string; value: HomeyCapValue }) => {
      if (
        typeof input?.deviceId !== "string" ||
        typeof input?.capabilityId !== "string" ||
        input.deviceId.length === 0 ||
        input.deviceId.length > 200 ||
        input.capabilityId.length === 0 ||
        input.capabilityId.length > 200
      ) {
        throw new Error("Ugyldig forespørsel");
      }
      return input;
    },
  )
  .handler(async ({ data }) => {
    const valid = await getValidAccessToken();
    if (!valid) throw new Error("Homey er ikke koblet til. Koble til først.");

    const resolved = await resolveHomeyBase(valid.token);
    if ("error" in resolved) throw new Error(resolved.error);

    const res = await fetch(
      `${resolved.base}/api/manager/devices/device/${encodeURIComponent(
        data.deviceId,
      )}/capability/${encodeURIComponent(data.capabilityId)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${valid.token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ value: data.value }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Klarte ikke styre enhet (${res.status}): ${text.slice(0, 200)}`);
    }
    return { ok: true };
  });

export const disconnectHomey = createServerFn({ method: "POST" }).handler(async () => {
  await deleteHomeyConnection();
  return { ok: true };
});
