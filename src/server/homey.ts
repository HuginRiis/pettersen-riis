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

async function fetchTokenLike(url: string, init: RequestInit): Promise<string> {
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

type HomeyTarget = {
  id: string;
  name: string | null;
  baseUrl: string;
};

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

async function resolveHomeyTarget(accessToken: string): Promise<HomeyTarget | null> {
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
    let conn: HomeyConnection | null;
    try {
      conn = await getValidConnection();
    } catch (e: any) {
      return { ok: false, needsConnect: false, error: e?.message ?? "Token-feil" };
    }

    if (!conn) return { ok: false, needsConnect: true };

    try {
      const target = await resolveHomeyTarget(conn.access_token);
      if (!target) {
        return {
          ok: false,
          needsConnect: false,
          error: "Fant ingen Homey knyttet til kontoen.",
        };
      }

      const delegationToken = await createDelegationToken(conn.access_token);
      const sessionToken = await createSessionToken(target.baseUrl, delegationToken);
      return await snapshotFromSession(sessionToken, target);
    } catch (e: any) {
      return { ok: false, needsConnect: false, error: e?.message ?? "Klarte ikke hente data" };
    }
  },
);

export const disconnectHomey = createServerFn({ method: "POST" }).handler(async () => {
  await deleteHomeyConnection();
  return { ok: true };
});

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
      const target = await resolveHomeyTarget(conn.access_token);
      if (!target) return { ok: false, error: "Fant ingen Homey" };

      const delegationToken = await createDelegationToken(conn.access_token);
      const sessionToken = await createSessionToken(target.baseUrl, delegationToken);

      const device = await findCameraDevice(sessionToken, target.baseUrl, "tollnes");
      if (!device) return { ok: false, error: "Fant ingen Netatmo-kamera" };

      const { buffer, contentType } = await tryCameraSnapshot(
        sessionToken,
        target.baseUrl,
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
