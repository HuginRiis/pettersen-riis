import { createServerFn } from "@tanstack/react-start";

// Homey Cloud API base. The PAT identifies the user; the API resolves to their Homey.
const HOMEY_API_BASE = "https://api.athom.com";

type HomeyZone = {
  id: string;
  name: string;
  parent?: string | null;
};

type HomeyCapability = {
  id: string;
  type?: string;
  title?: string;
  units?: string;
  value?: unknown;
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

export type HomeySnapshot = {
  ok: true;
  homeName?: string;
  zones: HomeyZone[];
  devices: HomeyDevice[];
} | {
  ok: false;
  error: string;
  status?: number;
};

async function homeyFetch(path: string, token: string) {
  const res = await fetch(`${HOMEY_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  return res;
}

/**
 * Resolve the user's first Homey (webhook URL) from /user/me, then return the
 * Homey-specific base URL we should use for device/zone calls.
 */
async function resolveHomeyBase(token: string): Promise<{ base: string; name?: string } | { error: string; status: number }> {
  const meRes = await homeyFetch("/user/me", token);
  if (!meRes.ok) {
    const text = await meRes.text();
    return { error: `Homey /user/me feilet: ${text.slice(0, 200)}`, status: meRes.status };
  }
  const me = await meRes.json();
  const homeys: Array<{ id: string; name?: string; remoteUrl?: string; localUrl?: string }> =
    me?.homeys ?? me?.user?.homeys ?? [];
  if (!homeys.length) {
    return { error: "Ingen Homey funnet på kontoen", status: 404 };
  }
  const homey = homeys[0];
  const base =
    homey.remoteUrl?.replace(/\/$/, "") ||
    `https://${homey.id}.connect.athom.com`;
  return { base, name: homey.name };
}

export const getHomeySnapshot = createServerFn({ method: "GET" }).handler(async (): Promise<HomeySnapshot> => {
  const token = process.env.HOMEY_PAT;
  if (!token) {
    return { ok: false, error: "HOMEY_PAT mangler i serverkonfigurasjonen" };
  }

  const resolved = await resolveHomeyBase(token);
  if ("error" in resolved) {
    return { ok: false, error: resolved.error, status: resolved.status };
  }

  // Fetch zones and devices in parallel
  const [zonesRes, devicesRes] = await Promise.all([
    fetch(`${resolved.base}/api/manager/zones/zone/`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    }),
    fetch(`${resolved.base}/api/manager/devices/device/`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    }),
  ]);

  if (!zonesRes.ok || !devicesRes.ok) {
    const status = !zonesRes.ok ? zonesRes.status : devicesRes.status;
    const body = !zonesRes.ok ? await zonesRes.text() : await devicesRes.text();
    return { ok: false, error: `Homey API feilet (${status}): ${body.slice(0, 200)}`, status };
  }

  const zonesRaw = (await zonesRes.json()) as Record<string, { id: string; name: string; parent?: string | null }>;
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
      caps[capId] = {
        id: capId,
        type: cap?.type,
        title: cap?.title,
        units: cap?.units,
        value: cap?.value,
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

  return {
    ok: true,
    homeName: resolved.name,
    zones,
    devices,
  };
});

export const setHomeyCapability = createServerFn({ method: "POST" })
  .inputValidator((input: { deviceId: string; capabilityId: string; value: unknown }) => {
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
  })
  .handler(async ({ data }) => {
    const token = process.env.HOMEY_PAT;
    if (!token) throw new Error("HOMEY_PAT mangler");

    const resolved = await resolveHomeyBase(token);
    if ("error" in resolved) {
      throw new Error(resolved.error);
    }

    const res = await fetch(
      `${resolved.base}/api/manager/devices/device/${encodeURIComponent(data.deviceId)}/capability/${encodeURIComponent(data.capabilityId)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
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
