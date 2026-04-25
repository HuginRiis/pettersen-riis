import { createServerFn } from "@tanstack/react-start";
import {
  deleteHomeyConnection,
  getHomeyConnection,
  updateHomeyTokens,
  type HomeyConnection,
} from "./homey-connection";

export const HOMEY_SCOPES = ["homey", "homey.device.readonly"];

const ATHOM_API_BASE = "https://api.athom.com";
const HOMEY_API_PAUSED_MESSAGE =
  "Homey API er midlertidig pauset for å la 429-låsen slippe. Prøv igjen litt senere.";

// Runtime flag — bevares mellom kall i samme worker-instans.
// Default: åpen (false) — kan pauses manuelt via setHomeyApiPaused() / UI-knapp.
const g = globalThis as unknown as { __homeyApiPaused?: boolean };
if (typeof g.__homeyApiPaused !== "boolean") {
  g.__homeyApiPaused = false;
}

function isHomeyApiPaused(): boolean {
  return g.__homeyApiPaused === true;
}

function ensureHomeyApiAvailable() {
  if (isHomeyApiPaused()) {
    throw new Error(HOMEY_API_PAUSED_MESSAGE);
  }
}

export const getHomeyApiPaused = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ paused: boolean }> => {
    return { paused: isHomeyApiPaused() };
  },
);

export const setHomeyApiPaused = createServerFn({ method: "POST" })
  .inputValidator((input: { paused: boolean }) => input)
  .handler(async ({ data }): Promise<{ paused: boolean }> => {
    g.__homeyApiPaused = data.paused === true;
    if (!g.__homeyApiPaused) {
      // Når vi åpner igjen — tøm caches slik at neste kall får ferske tokens.
      clearHomeyDataCaches();
    }
    return { paused: g.__homeyApiPaused };
  });

async function refreshAccessToken(conn: HomeyConnection): Promise<HomeyConnection> {
  ensureHomeyApiAvailable();
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
  ensureHomeyApiAvailable();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${url} feilet (${res.status}): ${text.slice(0, 200)}`);
  }

  return (await res.json()) as T;
}

async function fetchTokenLike(url: string, init: RequestInit): Promise<string> {
  ensureHomeyApiAvailable();
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${url} feilet (${res.status}): ${text.slice(0, 200)}`);
  }

  const raw = (await res.text()).trim();

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") return parsed;
    if (parsed && typeof parsed === "object") {
      const token =
        (parsed as Record<string, unknown>).token ??
        (parsed as Record<string, unknown>).access_token ??
        (parsed as Record<string, unknown>).sessionToken;
      if (typeof token === "string" && token.length > 0) return token;
    }
  } catch {
    // fall through to raw parsing
  }

  return raw.replace(/^"|"$/g, "");
}

export type HomeyCapValue = string | number | boolean | null;

export type HomeyCapabilityEnumValue = { id: string; title?: string };

export type HomeyCapabilityMeta = {
  value: HomeyCapValue;
  min?: number;
  max?: number;
  step?: number;
  values?: HomeyCapabilityEnumValue[];
};

export type HomeyDeviceSnapshot = {
  id: string;
  name: string;
  class?: string;
  zone?: string | null;
  available?: boolean;
  /** Driver/app-identifikator (f.eks. "homey:app:com.philips.hue") — brukes for å skille merker som Philips Hue. */
  driverUri?: string | null;
  capabilities: Record<string, HomeyCapabilityMeta>;
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

type HomeyTarget = {
  id: string;
  name: string | null;
  baseUrl: string;
};

type HomeySessionContext = {
  target: HomeyTarget;
  sessionToken: string;
};

type HomeyRawSnapshot = {
  homeName: string | null;
  zonesRaw: any[];
  devicesRaw: any[];
};

type CacheEntry<T> = {
  key: string;
  value: T;
  expiresAt: number;
};

type InflightEntry<T> = {
  key: string;
  promise: Promise<T>;
};

const HOMEY_TARGET_TTL_MS = 30 * 60_000;
const HOMEY_SESSION_TTL_MS = 8 * 60_000;
// Snapshot caches i 3 minutter — alle Homey-baserte sider deler denne.
const HOMEY_SNAPSHOT_TTL_MS = 3 * 60_000;

let homeyTargetCache: CacheEntry<HomeyTarget | null> | null = null;
let homeySessionCache: CacheEntry<HomeySessionContext> | null = null;
let homeySnapshotCache: CacheEntry<HomeyRawSnapshot> | null = null;

let homeyTargetInflight: InflightEntry<HomeyTarget | null> | null = null;
let homeySessionInflight: InflightEntry<HomeySessionContext | null> | null = null;
let homeySnapshotInflight: InflightEntry<HomeyRawSnapshot | null> | null = null;

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function getHomeyCacheKey(conn: HomeyConnection) {
  return `${conn.id}:${conn.access_token}`;
}

function getCacheEntry<T>(
  entry: CacheEntry<T> | null,
  key: string,
  allowStale = false,
): CacheEntry<T> | null {
  if (!entry || entry.key !== key) return null;
  if (allowStale || entry.expiresAt > Date.now()) return entry;
  return null;
}

function isRateLimitedMessage(message: string) {
  return /(^|[^\d])429([^\d]|$)|too_many_requests|rate-limit/i.test(message);
}

function isHomeyAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /(^|[^\d])401([^\d]|$)|unauthorized|forbidden/i.test(message);
}

function clearHomeyDataCaches() {
  homeySnapshotCache = null;
  homeySnapshotInflight = null;
  livingRoomCache = null;
}

function clearHomeySessionCaches() {
  homeySessionCache = null;
  homeySessionInflight = null;
  clearHomeyDataCaches();
}

async function resolveHomeyTargetRaw(accessToken: string): Promise<HomeyTarget | null> {
  const me = await fetchJson<any>(`${ATHOM_API_BASE}/user/me`, accessToken);
  const homeysVal = me?.homeys ?? null;
  const homeys: any[] = Array.isArray(homeysVal)
    ? homeysVal
    : homeysVal && typeof homeysVal === "object"
      ? Object.values(homeysVal)
      : [];

  if (homeys.length === 0) return null;

  const configuredHomeyId = process.env.HOMEY_ID;
  const selected =
    homeys.find((homey) => {
      const id = homey?._id ?? homey?.id;
      return configuredHomeyId ? id === configuredHomeyId : true;
    }) ?? homeys[0];

  const id = selected?._id ?? selected?.id;
  if (!id || typeof id !== "string") return null;

  const baseUrl =
    selected?.remoteUrl ??
    selected?.localUrlSecure ??
    selected?.localUrl ??
    `https://${id}.connect.athom.com`;

  return {
    id,
    name: selected?.name ?? null,
    baseUrl: normalizeBaseUrl(baseUrl),
  };
}

async function getResolvedHomeyTarget(conn: HomeyConnection): Promise<HomeyTarget | null> {
  const key = getHomeyCacheKey(conn);
  const cached = getCacheEntry(homeyTargetCache, key);
  if (cached) return cached.value;
  if (homeyTargetInflight?.key === key) return await homeyTargetInflight.promise;

  const promise = resolveHomeyTargetRaw(conn.access_token)
    .then((target) => {
      homeyTargetCache = {
        key,
        value: target,
        expiresAt: Date.now() + HOMEY_TARGET_TTL_MS,
      };
      return target;
    })
    .catch((error) => {
      const stale = getCacheEntry(homeyTargetCache, key, true);
      const message = error instanceof Error ? error.message : String(error ?? "");
      if (stale && isRateLimitedMessage(message)) return stale.value;
      if (isHomeyAuthError(error)) clearHomeySessionCaches();
      throw error;
    })
    .finally(() => {
      if (homeyTargetInflight?.key === key) homeyTargetInflight = null;
    });

  homeyTargetInflight = { key, promise };
  return await promise;
}

async function createDelegationToken(accessToken: string): Promise<string> {
  return await fetchTokenLike(`${ATHOM_API_BASE}/delegation/token?audience=homey`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
}

async function createSessionToken(baseUrl: string, delegationToken: string): Promise<string> {
  return await fetchTokenLike(`${baseUrl}/api/manager/users/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ token: delegationToken }),
  });
}

async function getHomeySessionContext(conn: HomeyConnection): Promise<HomeySessionContext | null> {
  const key = getHomeyCacheKey(conn);
  const cached = getCacheEntry(homeySessionCache, key);
  if (cached) return cached.value;
  if (homeySessionInflight?.key === key) return await homeySessionInflight.promise;

  const promise = (async () => {
    const target = await getResolvedHomeyTarget(conn);
    if (!target) return null;
    const delegationToken = await createDelegationToken(conn.access_token);
    const sessionToken = await createSessionToken(target.baseUrl, delegationToken);
    const context = { target, sessionToken };
    homeySessionCache = {
      key,
      value: context,
      expiresAt: Date.now() + HOMEY_SESSION_TTL_MS,
    };
    return context;
  })()
    .catch((error) => {
      const stale = getCacheEntry(homeySessionCache, key, true);
      const message = error instanceof Error ? error.message : String(error ?? "");
      if (stale && isRateLimitedMessage(message)) return stale.value;
      if (isHomeyAuthError(error)) clearHomeySessionCaches();
      throw error;
    })
    .finally(() => {
      if (homeySessionInflight?.key === key) homeySessionInflight = null;
    });

  homeySessionInflight = { key, promise };
  return await promise;
}

async function snapshotFromSession(
  sessionToken: string,
  target: HomeyTarget,
): Promise<HomeySnapshot> {
  const apiBase = `${target.baseUrl}/api`;

  try {
    const [systemRaw, zonesRaw, devicesRaw] = await Promise.all([
      fetchJson<any>(`${apiBase}/manager/system/`, sessionToken).catch(() => null),
      fetchJson<any>(`${apiBase}/manager/zones/zone`, sessionToken),
      fetchJson<any>(`${apiBase}/manager/devices/device`, sessionToken),
    ]);

    const homeName: string | null = systemRaw?.hostname ?? systemRaw?.name ?? target.name;

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
      return {
        id: d.id ?? d._id ?? String(i),
        name: d.name ?? "Ukjent",
        class: d.class,
        zone: d.zone ?? null,
        available: d.available !== false,
        driverUri: d.driverUri ?? d.driverId ?? d.driver?.uri ?? d.driver?.id ?? null,
        capabilities: extractCapabilityMeta(d.capabilitiesObj ?? d.capabilities_obj),
      };
    });

    return { ok: true, homeName, zones, devices };
  } catch (e: any) {
    return { ok: false, needsConnect: false, error: e?.message ?? "Klarte ikke hente data" };
  }
}

function mapSnapshotFromRaw(raw: HomeyRawSnapshot): HomeySnapshot {
  const zones: HomeyZone[] = raw.zonesRaw.map((z: any, i: number) => ({
    id: z.id ?? z._id ?? String(i),
    name: z.name ?? "Ukjent sal",
  }));

  const devices: HomeyDeviceSnapshot[] = raw.devicesRaw.map((d: any, i: number) => {
    return {
      id: d.id ?? d._id ?? String(i),
      name: d.name ?? "Ukjent",
      class: d.class,
      zone: d.zone ?? null,
      available: d.available !== false,
      driverUri: d.driverUri ?? d.driverId ?? d.driver?.uri ?? d.driver?.id ?? null,
      capabilities: extractCapabilityMeta(d.capabilitiesObj ?? d.capabilities_obj),
    };
  });

  return { ok: true, homeName: raw.homeName, zones, devices };
}

async function getHomeyRawSnapshot(conn: HomeyConnection): Promise<HomeyRawSnapshot | null> {
  const key = getHomeyCacheKey(conn);
  const cached = getCacheEntry(homeySnapshotCache, key);
  if (cached) return cached.value;
  if (homeySnapshotInflight?.key === key) return await homeySnapshotInflight.promise;

  const promise = (async () => {
    const session = await getHomeySessionContext(conn);
    if (!session) return null;
    const apiBase = `${session.target.baseUrl}/api`;
    const [systemRaw, zonesRaw, devicesRaw] = await Promise.all([
      fetchJson<any>(`${apiBase}/manager/system/`, session.sessionToken).catch(() => null),
      fetchJson<any>(`${apiBase}/manager/zones/zone`, session.sessionToken),
      fetchJson<any>(`${apiBase}/manager/devices/device`, session.sessionToken),
    ]);

    const raw: HomeyRawSnapshot = {
      homeName: systemRaw?.hostname ?? systemRaw?.name ?? session.target.name,
      zonesRaw: Array.isArray(zonesRaw)
        ? zonesRaw
        : zonesRaw && typeof zonesRaw === "object"
          ? Object.values(zonesRaw)
          : [],
      devicesRaw: Array.isArray(devicesRaw)
        ? devicesRaw
        : devicesRaw && typeof devicesRaw === "object"
          ? Object.values(devicesRaw)
          : [],
    };

    homeySnapshotCache = {
      key,
      value: raw,
      expiresAt: Date.now() + HOMEY_SNAPSHOT_TTL_MS,
    };
    return raw;
  })()
    .catch((error) => {
      const stale = getCacheEntry(homeySnapshotCache, key, true);
      const message = error instanceof Error ? error.message : String(error ?? "");
      if (stale && isRateLimitedMessage(message)) return stale.value;
      if (isHomeyAuthError(error)) clearHomeySessionCaches();
      throw error;
    })
    .finally(() => {
      if (homeySnapshotInflight?.key === key) homeySnapshotInflight = null;
    });

  homeySnapshotInflight = { key, promise };
  return await promise;
}

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
      const raw = await getHomeyRawSnapshot(conn);
      if (!raw) {
        return {
          ok: false,
          needsConnect: false,
          error: "Fant ingen Homey knyttet til kontoen.",
        };
      }
      return mapSnapshotFromRaw(raw);
    } catch (e: any) {
      return { ok: false, needsConnect: false, error: e?.message ?? "Klarte ikke hente data" };
    }
  },
);

export const disconnectHomey = createServerFn({ method: "POST" }).handler(async () => {
  await deleteHomeyConnection();
  homeyTargetCache = null;
  clearHomeySessionCaches();
  return { ok: true };
});

// ============================================================
// Verisure "Hjem alarm" — homealarm_state capability
// ============================================================

export type HomeAlarmState = "armed" | "partially_armed" | "disarmed";

export type HomeAlarmStatusResult =
  | { ok: false; needsConnect?: boolean; error: string }
  | {
      ok: true;
      deviceId: string;
      deviceName: string;
      zoneName: string;
      state: HomeAlarmState | null;
      available: boolean;
      lastUpdated: string | null;
      fetchedAt: string;
    };

function findHomeAlarmDevice(
  devicesRaw: any[],
): { device: any; caps: any } | null {
  // 1. Eksakt match på navn "hjem alarm" (Verisure heter typisk dette på norsk)
  const byName = devicesRaw.find((d) => {
    const n = (d?.name ?? "").toString().toLowerCase().trim();
    if (!n) return false;
    if (n === "hjem alarm" || n === "hjemalarm" || n === "home alarm") return true;
    return false;
  });
  const candidates: any[] = [];
  if (byName) candidates.push(byName);
  // 2. Hvilken som helst Verisure-enhet med homealarm_state-capability
  for (const d of devicesRaw) {
    if (candidates.includes(d)) continue;
    const caps = d?.capabilitiesObj ?? d?.capabilities_obj ?? {};
    if (caps && typeof caps === "object" && "homealarm_state" in caps) {
      candidates.push(d);
    }
  }
  for (const d of candidates) {
    const caps = d?.capabilitiesObj ?? d?.capabilities_obj ?? {};
    if (caps && typeof caps === "object" && "homealarm_state" in caps) {
      return { device: d, caps };
    }
  }
  return null;
}

export const getHomeAlarmStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<HomeAlarmStatusResult> => {
    let conn: HomeyConnection | null;
    try {
      conn = await getValidConnection();
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Token-feil" };
    }
    if (!conn) return { ok: false, needsConnect: true, error: "Ikke tilkoblet Homey" };

    try {
      const raw = await getHomeyRawSnapshot(conn);
      if (!raw) return { ok: false, error: "Fant ingen Homey-data" };

      const found = findHomeAlarmDevice(raw.devicesRaw);
      if (!found) {
        return {
          ok: false,
          error: "Fant ikke «Hjem alarm» i Homey (ingen homealarm_state-enhet).",
        };
      }
      const { device, caps } = found;
      const zoneById = new Map<string, string>();
      for (const z of raw.zonesRaw) {
        zoneById.set(z.id ?? z._id, z.name ?? "Ukjent sal");
      }
      const stateCap = caps.homealarm_state;
      const value = stateCap?.value;
      const state: HomeAlarmState | null =
        value === "armed" || value === "partially_armed" || value === "disarmed"
          ? value
          : null;

      return {
        ok: true,
        deviceId: device.id ?? device._id,
        deviceName: device.name ?? "Hjem alarm",
        zoneName: zoneById.get(device.zone) ?? "Borgen",
        state,
        available: device.available !== false,
        lastUpdated: pickCapTimestamp(stateCap),
        fetchedAt: new Date().toISOString(),
      };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Klarte ikke hente alarm-status" };
    }
  },
);

export const setHomeAlarmState = createServerFn({ method: "POST" })
  .inputValidator((input: { state: HomeAlarmState; who?: string }) => {
    if (
      input?.state !== "armed" &&
      input?.state !== "partially_armed" &&
      input?.state !== "disarmed"
    ) {
      throw new Error("Ugyldig alarm-tilstand");
    }
    const who =
      typeof input.who === "string" && input.who.length > 0 && input.who.length < 50
        ? input.who
        : "Alle";
    return { state: input.state, who };
  })
  .handler(
    async ({
      data,
    }): Promise<
      | { ok: false; error: string }
      | { ok: true; state: HomeAlarmState; who: string; changedAt: string }
    > => {
      let conn: HomeyConnection | null;
      try {
        conn = await getValidConnection();
      } catch (e: any) {
        return { ok: false, error: e?.message ?? "Token-feil" };
      }
      if (!conn) return { ok: false, error: "Ikke tilkoblet Homey" };

      try {
        const session = await getHomeySessionContext(conn);
        if (!session) return { ok: false, error: "Klarte ikke åpne Homey-sesjon" };
        const raw = await getHomeyRawSnapshot(conn);
        if (!raw) return { ok: false, error: "Fant ingen Homey-data" };

        const found = findHomeAlarmDevice(raw.devicesRaw);
        if (!found) return { ok: false, error: "Fant ikke «Hjem alarm»" };

        const apiBase = `${session.target.baseUrl}/api`;
        const deviceId = found.device.id ?? found.device._id;
        const res = await fetch(
          `${apiBase}/manager/devices/device/${deviceId}/capability/homealarm_state`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${session.sessionToken}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ value: data.state }),
          },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return {
            ok: false,
            error: `Homey avviste kommandoen (${res.status}): ${text.slice(0, 200)}`,
          };
        }
        // Nuller snapshot-cache så neste lesing ser den nye verdien
        homeySnapshotCache = null;

        const changedAt = new Date().toISOString();
        return { ok: true, state: data.state, who: data.who, changedAt };
      } catch (e: any) {
        return { ok: false, error: e?.message ?? "Klarte ikke endre alarm" };
      }
    },
  );

// ============================================================
// Doors & Locks snapshot (Verisure / Yale Doorman / contact sensors)
// ============================================================

export type DoorOrLockEntry = {
  id: string;
  name: string;
  zoneName: string;
  available: boolean;
  // For locks (Yale Doorman, Verisure smartlocks)
  locked?: boolean | null;
  // For door/window contact sensors (Verisure)
  contactOpen?: boolean | null; // true = open, false = closed
  // For motion sensors
  motion?: boolean | null;
  battery?: number | null;
  tamper?: boolean | null;
  brand: "yale" | "verisure" | "annet";
  kind: "lock" | "door" | "window" | "motion" | "other";
  lastUpdated: string | null;
};

export type DoorsLocksResult =
  | { ok: false; needsConnect?: boolean; error: string }
  | {
      ok: true;
      locks: DoorOrLockEntry[];
      doors: DoorOrLockEntry[];
      windows: DoorOrLockEntry[];
      motions: DoorOrLockEntry[];
      fetchedAt: string;
    };

function detectBrand(d: any): DoorOrLockEntry["brand"] {
  const hay = [d?.driverUri, d?.appId, d?.ownerName, d?.driverId, d?.name]
    .map((x) => (typeof x === "string" ? x.toLowerCase() : ""))
    .join(" ");
  if (/yale|doorman|com\.yale|assa.?abloy/.test(hay)) return "yale";
  if (/verisure|securitas/.test(hay)) return "verisure";
  return "annet";
}

function pickCapTimestamp(capObj: any): string | null {
  const t = capObj?.lastUpdated ?? capObj?.last_updated ?? capObj?.lastChanged;
  if (!t) return null;
  if (typeof t === "string") return t;
  if (typeof t === "number") return new Date(t).toISOString();
  return null;
}

function classifyKind(
  cls: string | undefined,
  caps: any,
  name: string,
): DoorOrLockEntry["kind"] {
  if (cls === "lock" || "locked" in caps) return "lock";
  const n = name.toLowerCase();
  if ("alarm_contact" in caps) {
    // Check door keywords FIRST — many sensor model names include both "door" and "window"
    // (e.g. "Door and Window Sensor"), so door must win when both appear.
    if (/dør|dor|door|port|inngang|ytter|garasje|terasse|terrasse|veranda|balkong/.test(n))
      return "door";
    if (/vindu|window/.test(n)) return "window";
    return "door"; // default contact = door
  }
  if ("alarm_motion" in caps) return "motion";
  return "other";
}

export const getDoorsLocksSnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<DoorsLocksResult> => {
    let conn: HomeyConnection | null;
    try {
      conn = await getValidConnection();
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Token-feil" };
    }
    if (!conn) return { ok: false, needsConnect: true, error: "Ikke tilkoblet Homey" };

    try {
      const raw = await getHomeyRawSnapshot(conn);
      if (!raw) return { ok: false, error: "Fant ingen Homey-data" };

      const zoneById = new Map<string, string>();
      for (const z of raw.zonesRaw) {
        zoneById.set(z.id ?? z._id, z.name ?? "Ukjent sal");
      }

      const locks: DoorOrLockEntry[] = [];
      const doors: DoorOrLockEntry[] = [];
      const windows: DoorOrLockEntry[] = [];
      const motions: DoorOrLockEntry[] = [];

      for (const d of raw.devicesRaw) {
        const caps = d.capabilitiesObj ?? d.capabilities_obj ?? {};
        if (!caps || typeof caps !== "object") continue;

        const hasLock = "locked" in caps;
        const hasContact = "alarm_contact" in caps;
        const hasMotion = "alarm_motion" in caps;
        if (!hasLock && !hasContact && !hasMotion) continue;

        const name = d.name ?? "Ukjent";
        const kind = classifyKind(d.class, caps, name);
        const brand = detectBrand(d);

        const lockedCap = caps.locked;
        const contactCap = caps.alarm_contact;
        const motionCap = caps.alarm_motion;
        const tamperCap = caps.alarm_tamper;
        const batteryCap = caps.measure_battery;

        const tsCandidates = [
          pickCapTimestamp(lockedCap),
          pickCapTimestamp(contactCap),
          pickCapTimestamp(motionCap),
        ].filter(Boolean) as string[];
        tsCandidates.sort();
        const lastUpdated = tsCandidates.length > 0 ? tsCandidates[tsCandidates.length - 1] : null;

        const entry: DoorOrLockEntry = {
          id: d.id ?? d._id,
          name,
          zoneName: zoneById.get(d.zone) ?? "Ukjent sal",
          available: d.available !== false,
          locked: hasLock ? (lockedCap?.value ?? null) : undefined,
          contactOpen: hasContact ? (contactCap?.value ?? null) : undefined,
          motion: hasMotion ? (motionCap?.value ?? null) : undefined,
          battery: typeof batteryCap?.value === "number" ? batteryCap.value : null,
          tamper: typeof tamperCap?.value === "boolean" ? tamperCap.value : null,
          brand,
          kind,
          lastUpdated,
        };

        if (kind === "lock") locks.push(entry);
        else if (kind === "door") doors.push(entry);
        else if (kind === "window") windows.push(entry);
        else if (kind === "motion") motions.push(entry);
      }

      const sortByName = (a: DoorOrLockEntry, b: DoorOrLockEntry) =>
        a.name.localeCompare(b.name, "nb");
      locks.sort(sortByName);
      doors.sort(sortByName);
      windows.sort(sortByName);
      motions.sort((a, b) => {
        // Recent motion first
        const at = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
        const bt = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
        return bt - at;
      });

      return {
        ok: true,
        locks,
        doors,
        windows,
        motions,
        fetchedAt: new Date().toISOString(),
      };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Klarte ikke hente dør/lås-data" };
    }
  },
);


// ============================================================
// Camera snapshot (Netatmo / generic Homey camera devices)
// ============================================================

export type CameraSnapshotResult =
  | { ok: false; error: string }
  | { ok: true; dataUrl: string; deviceName: string; capturedAt: string };

async function fetchBinary(
  url: string,
  init: RequestInit,
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  ensureHomeyApiAvailable();
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${url} feilet (${res.status}): ${text.slice(0, 200)}`);
  }
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const buffer = await res.arrayBuffer();
  return { buffer, contentType };
}

function bufferToDataUrl(buffer: ArrayBuffer, contentType: string) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);
  return `data:${contentType};base64,${base64}`;
}

async function findCameraDevice(
  sessionToken: string,
  baseUrl: string,
  hint: string,
): Promise<{ id: string; name: string; raw: any } | null> {
  const devicesRaw = await fetchJson<any>(
    `${baseUrl}/api/manager/devices/device`,
    sessionToken,
  );
  const list: any[] = Array.isArray(devicesRaw)
    ? devicesRaw
    : devicesRaw && typeof devicesRaw === "object"
      ? Object.values(devicesRaw)
      : [];

  const hintLc = hint.toLowerCase();
  const cameras = list.filter(
    (d) =>
      d?.class === "camera" ||
      d?.virtualClass === "camera" ||
      (typeof d?.driverUri === "string" && d.driverUri.toLowerCase().includes("netatmo")) ||
      (typeof d?.name === "string" && d.name.toLowerCase().includes("netatmo")),
  );

  const pool = cameras.length > 0 ? cameras : list;
  const matched =
    pool.find((d) => typeof d?.name === "string" && d.name.toLowerCase().includes(hintLc)) ??
    cameras[0] ??
    null;

  if (!matched) return null;
  return {
    id: matched.id ?? matched._id,
    name: matched.name ?? "Kamera",
    raw: matched,
  };
}

async function fetchImageById(
  baseUrl: string,
  sessionToken: string,
  imageId: string,
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  // Try a few known Homey image endpoints
  const candidates = [
    `${baseUrl}/api/image/${imageId}/image`,
    `${baseUrl}/api/image/${imageId}`,
    `${baseUrl}/api/manager/images/image/${imageId}/image`,
  ];
  let lastErr: Error | null = null;
  for (const url of candidates) {
    try {
      return await fetchBinary(url, {
        headers: { Authorization: `Bearer ${sessionToken}`, Accept: "image/*" },
      });
    } catch (e: any) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("Fant ikke bilde");
}

async function tryCameraSnapshot(
  sessionToken: string,
  baseUrl: string,
  device: { id: string; name: string; raw: any },
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  const apiBase = `${baseUrl}/api`;

  // Strategy 1: device.images array (most cameras expose this)
  const images = Array.isArray(device.raw?.images) ? device.raw.images : [];
  if (images.length > 0) {
    const lastErrors: string[] = [];
    // Prefer the last image (typically newest snapshot)
    for (const img of [...images].reverse()) {
      const imgId =
        img?.id ??
        img?._id ??
        img?.imageId ??
        (typeof img?.url === "string" ? img.url.split("/").filter(Boolean).pop() : null);
      const directUrl = typeof img?.url === "string" ? img.url : null;

      if (directUrl) {
        try {
          const fullUrl = directUrl.startsWith("http") ? directUrl : `${baseUrl}${directUrl}`;
          return await fetchBinary(fullUrl, {
            headers: { Authorization: `Bearer ${sessionToken}`, Accept: "image/*" },
          });
        } catch (e: any) {
          lastErrors.push(`url ${directUrl}: ${e?.message ?? e}`);
        }
      }
      if (imgId) {
        try {
          return await fetchImageById(baseUrl, sessionToken, imgId);
        } catch (e: any) {
          lastErrors.push(`id ${imgId}: ${e?.message ?? e}`);
        }
      }
    }
    if (lastErrors.length > 0) {
      throw new Error(`Klarte ikke hente kamera-bilde (${lastErrors.join(" | ")})`);
    }
  }

  // Strategy 2: refresh capability (camera devices often support this) then re-fetch device
  try {
    await fetch(`${apiBase}/manager/devices/device/${device.id}/capability/camera_refresh`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ value: true }),
    });
  } catch {
    // ignore — fall through
  }

  const refreshed = await fetchJson<any>(
    `${apiBase}/manager/devices/device/${device.id}`,
    sessionToken,
  );
  const imgs2 = Array.isArray(refreshed?.images) ? refreshed.images : [];
  if (imgs2.length > 0) {
    const last = imgs2[imgs2.length - 1];
    const imgId = last?.id ?? last?._id ?? last?.imageId;
    if (last?.url) {
      const fullUrl = String(last.url).startsWith("http")
        ? last.url
        : `${baseUrl}${last.url}`;
      return await fetchBinary(fullUrl, {
        headers: { Authorization: `Bearer ${sessionToken}`, Accept: "image/*" },
      });
    }
    if (imgId) {
      return await fetchImageById(baseUrl, sessionToken, imgId);
    }
  }

  throw new Error("Kameraet eksponerer ingen bilder via Homey API");
}

// ============================================================
// Bulk control: turn outdoor lights on/off
// ============================================================

async function listAllDevicesRaw(sessionToken: string, baseUrl: string): Promise<any[]> {
  const raw = await fetchJson<any>(`${baseUrl}/api/manager/devices/device`, sessionToken);
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

async function listZonesRaw(sessionToken: string, baseUrl: string): Promise<any[]> {
  const raw = await fetchJson<any>(`${baseUrl}/api/manager/zones/zone`, sessionToken);
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function isOutdoorZoneName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("ute") ||
    n.includes("ut ") ||
    n === "ut" ||
    n.includes("hage") ||
    n.includes("garasje") ||
    n.includes("inngang") ||
    n.includes("terrasse") ||
    n.includes("veranda") ||
    n.includes("uteområd") ||
    n.includes("utvendig") ||
    n.includes("outdoor") ||
    n.includes("garden") ||
    n.includes("yard")
  );
}

async function setDeviceOnoff(
  sessionToken: string,
  baseUrl: string,
  deviceId: string,
  value: boolean,
): Promise<boolean> {
  ensureHomeyApiAvailable();
  const res = await fetch(
    `${baseUrl}/api/manager/devices/device/${deviceId}/capability/onoff`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ value }),
    },
  );
  return res.ok;
}

/**
 * Sjekker om en Homey-enhet er en Philips Hue lyspære.
 * Vi vil KUN telle ekte Hue-lyspærer som "utelys" — ikke plugger,
 * sensorer, brytere eller andre Hue-tilbehør, og ikke andre lys-merker.
 */
function isPhilipsHueBulb(d: any): boolean {
  if (!d) return false;
  // Må være lys-klasse (kalles fra filter, men dobbeltsjekk)
  const cls = d?.class;
  const virt = d?.virtualClass;
  if (cls !== "light" && virt !== "light") return false;

  // Samle alle felter som identifiserer driver/app/merke
  const haystack = [
    d?.driverUri,
    d?.driverId,
    d?.driver?.uri,
    d?.driver?.id,
    d?.ownerUri,
    d?.ownerName,
    d?.appId,
    d?.app?.id,
  ]
    .filter((x) => typeof x === "string")
    .join(" ")
    .toLowerCase();

  // Hue-app i Homey heter typisk "com.philips.hue" eller "athom:app:com.philips.hue"
  // (offisiell Athom Hue-app). Aksepter også eldre/alternative pakker.
  return /philips\.?hue|hue-zigbee|com\.athom\.hue/.test(haystack);
}

/**
 * Eksakt liste over enheter som regnes som "utelys" i HouseHero.
 * Kun disse fire navnene skal trigge "Utelys tent" — alt annet ignoreres.
 */
const OUTDOOR_LIGHT_NAMES = new Set<string>([
  "ute lys vinterhage",
  "utelampe høyre",
  "ute venstre veranda",
  "utelampe venstre",
]);

function normalizeDeviceName(name: unknown): string {
  if (typeof name !== "string") return "";
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function isAllowedOutdoorLight(d: any): boolean {
  return OUTDOOR_LIGHT_NAMES.has(normalizeDeviceName(d?.name));
}

export type OutdoorLightsStatus = {
  ok: boolean;
  anyOn: boolean;
  onCount: number;
  totalCount: number;
  error?: string;
};

export const getOutdoorLightsStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<OutdoorLightsStatus> => {
    let conn: HomeyConnection | null;
    try {
      conn = await getValidConnection();
    } catch (e: any) {
      return { ok: false, anyOn: false, onCount: 0, totalCount: 0, error: e?.message ?? "Token-feil" };
    }
    if (!conn) {
      return { ok: false, anyOn: false, onCount: 0, totalCount: 0, error: "Ingen Homey-tilkobling" };
    }
    try {
      const session = await getHomeySessionContext(conn);
      if (!session) {
        return { ok: false, anyOn: false, onCount: 0, totalCount: 0, error: "Fant ingen Homey" };
      }
      const [zones, devices] = await Promise.all([
        listZonesRaw(session.sessionToken, session.target.baseUrl),
        listAllDevicesRaw(session.sessionToken, session.target.baseUrl),
      ]);
      const outdoorZoneIds = new Set<string>(
        zones
          .filter((z) => isOutdoorZoneName(z?.name ?? ""))
          .map((z) => z.id ?? z._id)
          .filter(Boolean),
      );
      const targets = devices.filter((d) => {
        if (!isAllowedOutdoorLight(d)) return false;
        const caps = d?.capabilitiesObj ?? d?.capabilities_obj ?? {};
        if (!caps || typeof caps !== "object" || !("onoff" in caps)) return false;
        return true;
      });
      let onCount = 0;
      for (const d of targets) {
        const caps = d?.capabilitiesObj ?? d?.capabilities_obj ?? {};
        if (caps?.onoff?.value === true) onCount += 1;
      }
      return { ok: true, anyOn: onCount > 0, onCount, totalCount: targets.length };
    } catch (e: any) {
      return { ok: false, anyOn: false, onCount: 0, totalCount: 0, error: e?.message ?? "Klarte ikke lese lys" };
    }
  },
);

export const setAllOutdoorLights = createServerFn({ method: "POST" })
  .inputValidator((input: { on: boolean }) => input)
  .handler(async ({ data }): Promise<{ ok: boolean; toggled: number; error?: string }> => {
    let conn: HomeyConnection | null;
    try {
      conn = await getValidConnection();
    } catch (e: any) {
      return { ok: false, toggled: 0, error: e?.message ?? "Token-feil" };
    }
    if (!conn) return { ok: false, toggled: 0, error: "Ingen Homey-tilkobling" };

    try {
      const session = await getHomeySessionContext(conn);
      if (!session) return { ok: false, toggled: 0, error: "Fant ingen Homey" };

      const [zones, devices] = await Promise.all([
        listZonesRaw(session.sessionToken, session.target.baseUrl),
        listAllDevicesRaw(session.sessionToken, session.target.baseUrl),
      ]);

      const outdoorZoneIds = new Set<string>(
        zones
          .filter((z) => isOutdoorZoneName(z?.name ?? ""))
          .map((z) => z.id ?? z._id)
          .filter(Boolean),
      );

      const targets = devices.filter((d) => {
        if (!isAllowedOutdoorLight(d)) return false;
        const caps = d?.capabilitiesObj ?? d?.capabilities_obj ?? {};
        if (!caps || typeof caps !== "object" || !("onoff" in caps)) return false;
        return true;
      });

      let toggled = 0;
      await Promise.all(
        targets.map(async (d) => {
          const id = d.id ?? d._id;
          if (!id) return;
          const ok = await setDeviceOnoff(
            session.sessionToken,
            session.target.baseUrl,
            id,
            data.on,
          );
          if (ok) toggled += 1;
        }),
      );

      return { ok: true, toggled };
    } catch (e: any) {
      return { ok: false, toggled: 0, error: e?.message ?? "Klarte ikke styre lys" };
    }
  });

// ============================================================
// Living room lights — bulk control of named devices in "stue"
// ============================================================

function isLivingRoomZoneName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("stue") ||
    n.includes("stua") ||
    n.includes("living") ||
    n.includes("livingroom")
  );
}

// Konkrete enheter Steintavlen skal styre (navn matches fuzzy, case-insensitivt).
// Hver entry er en liste med tokens som ALLE må finnes i enhetsnavnet for å matche.
// Dette tillater både lyspærer, stikkontakter (Taklys) og hva enn klasse Homey gir dem.
const LIVING_ROOM_TARGETS: Array<{ label: string; tokens: string[] }> = [
  { label: "Høyttaler peis veranda", tokens: ["høyt", "peis"] },
  { label: "Høyttaler TV veranda", tokens: ["høyt", "tv"] },
  { label: "Lampett under projector", tokens: ["lampett"] },
  { label: "Sweet høyre", tokens: ["sweet", "høyre"] },
  { label: "Sweet venstre", tokens: ["sweet", "venstre"] },
  { label: "Taklys (stikkontakt)", tokens: ["taklys"] },
  { label: "Stålampe", tokens: ["stålampe"] },
];

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function findLivingRoomTargets(devices: any[]): any[] {
  const matched = new Map<string, any>();
  for (const t of LIVING_ROOM_TARGETS) {
    const candidate = devices.find((d) => {
      if (!d) return false;
      const caps = d?.capabilitiesObj ?? d?.capabilities_obj ?? {};
      if (!caps || typeof caps !== "object" || !("onoff" in caps)) return false;
      const name = normalizeName(String(d?.name ?? ""));
      return t.tokens.every((tok) => name.includes(tok.toLowerCase()));
    });
    if (candidate) {
      const id = candidate.id ?? candidate._id;
      if (id) matched.set(id, candidate);
    }
  }
  return Array.from(matched.values());
}

export const getLivingRoomLightsState = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ ok: boolean; anyOn: boolean; total: number; error?: string }> => {
    let conn: HomeyConnection | null;
    try {
      conn = await getValidConnection();
    } catch (e: any) {
      return { ok: false, anyOn: false, total: 0, error: e?.message ?? "Token-feil" };
    }
    if (!conn) return { ok: false, anyOn: false, total: 0, error: "Ingen Homey-tilkobling" };

    try {
      const raw = await getHomeyRawSnapshot(conn);
      if (!raw) return { ok: false, anyOn: false, total: 0, error: "Fant ingen Homey" };

      const devices = raw.devicesRaw;
      const lights = findLivingRoomTargets(devices);

      const anyOn = lights.some((d) => {
        const caps = d?.capabilitiesObj ?? d?.capabilities_obj ?? {};
        return caps?.onoff?.value === true;
      });

      return { ok: true, anyOn, total: lights.length };
    } catch (e: any) {
      return { ok: false, anyOn: false, total: 0, error: e?.message ?? "Feil" };
    }
  },
);

export const setLivingRoomLights = createServerFn({ method: "POST" })
  .inputValidator((input: { on: boolean }) => input)
  .handler(async ({ data }): Promise<{ ok: boolean; toggled: number; error?: string }> => {
    let conn: HomeyConnection | null;
    try {
      conn = await getValidConnection();
    } catch (e: any) {
      return { ok: false, toggled: 0, error: e?.message ?? "Token-feil" };
    }
    if (!conn) return { ok: false, toggled: 0, error: "Ingen Homey-tilkobling" };

    try {
      const session = await getHomeySessionContext(conn);
      if (!session) return { ok: false, toggled: 0, error: "Fant ingen Homey" };

      const devices = await listAllDevicesRaw(session.sessionToken, session.target.baseUrl);
      const targets = findLivingRoomTargets(devices);

      let toggled = 0;
      await Promise.all(
        targets.map(async (d) => {
          const id = d.id ?? d._id;
          if (!id) return;
          const ok = await setDeviceOnoff(
            session.sessionToken,
            session.target.baseUrl,
            id,
            data.on,
          );
          if (ok) toggled += 1;
        }),
      );

      return { ok: true, toggled };
    } catch (e: any) {
      return { ok: false, toggled: 0, error: e?.message ?? "Klarte ikke styre lys" };
    }
  });

// ============================================================
// Living room — full device list (lights, heat pump, etc.)
// Returnerer alle enheter i sone "stue/stua/living" med
// styrbare capabilities (onoff, target_temperature, dim).
// ============================================================

export type LivingRoomDevice = {
  id: string;
  name: string;
  class?: string;
  zoneName: string | null;
  capabilities: {
    onoff?: boolean;
    target_temperature?: number;
    target_temperature_min?: number;
    target_temperature_max?: number;
    target_temperature_step?: number;
    measure_temperature?: number;
    dim?: number;
    thermostat_mode?: string;
    thermostat_mode_values?: { id: string; title?: string }[];
  };
};

export type LivingRoomDevicesResult =
  | { ok: false; error: string }
  | { ok: true; devices: LivingRoomDevice[] };

function readCapValue(caps: any, id: string): any {
  return caps?.[id]?.value;
}

function readCapMeta(caps: any, id: string, key: string): any {
  return caps?.[id]?.[key];
}

// In-memory cache for living-room devices to avoid hammering Athom from
// always-on iPads. TTL ~45s; invalideres når en capability settes.
let livingRoomCache: { at: number; data: LivingRoomDevicesResult } | null = null;
// Stue-enheter caches i 3 minutter for å være snill mot Athom-API'et.
const LIVING_ROOM_TTL_MS = 3 * 60_000;
function invalidateLivingRoomCache() {
  livingRoomCache = null;
}

export const getLivingRoomDevices = createServerFn({ method: "GET" }).handler(
  async (): Promise<LivingRoomDevicesResult> => {
    // Server-side cache: returner forrige svar om det er ferskt nok.
    if (livingRoomCache && Date.now() - livingRoomCache.at < LIVING_ROOM_TTL_MS) {
      return livingRoomCache.data;
    }
    let conn: HomeyConnection | null;
    try {
      conn = await getValidConnection();
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Token-feil" };
    }
    if (!conn) return { ok: false, error: "Ingen Homey-tilkobling" };

    try {
      const raw = await getHomeyRawSnapshot(conn);
      if (!raw) return { ok: false, error: "Fant ingen Homey" };

      const [zones, devices] = [raw.zonesRaw, raw.devicesRaw];
      const zoneNameById = new Map<string, string>(
        zones.map((z: any) => [z.id ?? z._id, z.name ?? "Ukjent sone"]),
      );

      const livingZoneIds = new Set<string>(
        zones
          .filter((z: any) => isLivingRoomZoneName(String(z?.name ?? "")))
          .map((z: any) => z.id ?? z._id)
          .filter(Boolean),
      );

      const inLiving = devices.filter((d: any) => {
        if (!d) return false;
        if (d.zone && livingZoneIds.has(d.zone)) return true;
        const n = String(d?.name ?? "").toLowerCase();
        return n.includes("stue") || n.includes("stua");
      });

      const result: LivingRoomDevice[] = inLiving
        .map((d: any) => {
          const caps = d?.capabilitiesObj ?? d?.capabilities_obj ?? {};
          const out: LivingRoomDevice = {
            id: d.id ?? d._id,
            name: d.name ?? "Ukjent",
            class: d.class,
            zoneName: d.zone ? zoneNameById.get(d.zone) ?? null : null,
            capabilities: {},
          };
          const onoff = readCapValue(caps, "onoff");
          if (typeof onoff === "boolean") out.capabilities.onoff = onoff;
          const tt = readCapValue(caps, "target_temperature");
          if (typeof tt === "number") {
            out.capabilities.target_temperature = tt;
            const min = readCapMeta(caps, "target_temperature", "min");
            const max = readCapMeta(caps, "target_temperature", "max");
            const step = readCapMeta(caps, "target_temperature", "step");
            if (typeof min === "number") out.capabilities.target_temperature_min = min;
            if (typeof max === "number") out.capabilities.target_temperature_max = max;
            if (typeof step === "number") out.capabilities.target_temperature_step = step;
          }
          const mt = readCapValue(caps, "measure_temperature");
          if (typeof mt === "number") out.capabilities.measure_temperature = mt;
          const dim = readCapValue(caps, "dim");
          if (typeof dim === "number") out.capabilities.dim = dim;
          const tm = readCapValue(caps, "thermostat_mode");
          if (typeof tm === "string") out.capabilities.thermostat_mode = tm;
          // Hent enum-verdier fra capability-meta hvis tilgjengelig
          const tmValues = readCapMeta(caps, "thermostat_mode", "values");
          if (Array.isArray(tmValues)) {
            const cleaned = tmValues
              .map((v: any) => {
                if (typeof v === "string") return { id: v };
                if (v && typeof v === "object" && typeof v.id === "string") {
                  return {
                    id: v.id,
                    title:
                      typeof v.title === "string"
                        ? v.title
                        : typeof v?.title?.no === "string"
                          ? v.title.no
                          : typeof v?.title?.en === "string"
                            ? v.title.en
                            : undefined,
                  };
                }
                return null;
              })
              .filter(Boolean) as { id: string; title?: string }[];
            if (cleaned.length > 0) out.capabilities.thermostat_mode_values = cleaned;
          }
          return out;
        })
        .filter(
          (d) =>
            d.capabilities.onoff !== undefined ||
            d.capabilities.target_temperature !== undefined ||
            d.capabilities.dim !== undefined,
        );

      const out: LivingRoomDevicesResult = { ok: true, devices: result };
      livingRoomCache = { at: Date.now(), data: out };
      return out;
    } catch (e: any) {
      const msg = e?.message ?? "Klarte ikke hente stue-enheter";
      if (/429|too_many_requests/i.test(msg)) {
        if (livingRoomCache) {
          livingRoomCache.at = Date.now() - LIVING_ROOM_TTL_MS + 30_000;
          return livingRoomCache.data;
        }
        return { ok: false, error: "Athom rate-limit (429) — venter litt" };
      }
      return { ok: false, error: msg };
    }
  },
);

async function setDeviceCapabilityRaw(
  sessionToken: string,
  baseUrl: string,
  deviceId: string,
  capabilityId: string,
  value: boolean | number | string,
): Promise<boolean> {
  ensureHomeyApiAvailable();
  const res = await fetch(
    `${baseUrl}/api/manager/devices/device/${deviceId}/capability/${capabilityId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ value }),
    },
  );
  return res.ok;
}

export const setLivingRoomDeviceCapability = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      deviceId: string;
      capability: "onoff" | "target_temperature" | "dim" | "thermostat_mode";
      value: boolean | number | string;
    }) => input,
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    let conn: HomeyConnection | null;
    try {
      conn = await getValidConnection();
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Token-feil" };
    }
    if (!conn) return { ok: false, error: "Ingen Homey-tilkobling" };

    try {
      const session = await getHomeySessionContext(conn);
      if (!session) return { ok: false, error: "Fant ingen Homey" };

      const ok = await setDeviceCapabilityRaw(
        session.sessionToken,
        session.target.baseUrl,
        data.deviceId,
        data.capability,
        data.value,
      );
      if (!ok) return { ok: false, error: "Homey avviste kommandoen" };
      // Drop cache slik at neste poll henter fersk state.
      invalidateLivingRoomCache();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Kommando feilet" };
    }
  });

export const getTollnesCameraSnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<CameraSnapshotResult> => {
    let conn: HomeyConnection | null;
    try {
      conn = await getValidConnection();
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Token-feil" };
    }
    if (!conn) return { ok: false, error: "Ingen Homey-tilkobling" };

    try {
      const session = await getHomeySessionContext(conn);
      if (!session) return { ok: false, error: "Fant ingen Homey" };

      const device = await findCameraDevice(
        session.sessionToken,
        session.target.baseUrl,
        "tollnes",
      );
      if (!device) return { ok: false, error: "Fant ingen Netatmo-kamera" };

      const { buffer, contentType } = await tryCameraSnapshot(
        session.sessionToken,
        session.target.baseUrl,
        device,
      );

      return {
        ok: true,
        dataUrl: bufferToDataUrl(buffer, contentType),
        deviceName: device.name,
        capturedAt: new Date().toISOString(),
      };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Klarte ikke hente snapshot" };
    }
  },
);
