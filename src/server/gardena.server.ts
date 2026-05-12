/**
 * Gardena Smart System API (Husqvarna Group).
 * Server-only — bruker APP_KEY/SECRET (client_credentials).
 */

const AUTH_URL = "https://api.authentication.husqvarnagroup.dev/v1/oauth2/token";
const API_BASE = "https://api.smart.gardena.dev/v2";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const key = process.env.GARDENA_APP_KEY;
  const secret = process.env.GARDENA_APP_SECRET;
  if (!key || !secret) throw new Error("Mangler GARDENA_APP_KEY / GARDENA_APP_SECRET");

  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) {
    return cachedToken.token;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: key,
    client_secret: secret,
  });

  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gardena auth feilet (${res.status}): ${text.slice(0, 200)}`);
  }
  const json: any = await res.json();
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000,
  };
  return cachedToken.token;
}

async function gardenaGet(path: string): Promise<any> {
  const token = await getAccessToken();
  const key = process.env.GARDENA_APP_KEY!;
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Api-Key": key,
      Accept: "application/vnd.api+json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gardena API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export type GardenaAttr<T = any> = { value: T; timestamp?: string } | undefined;

export type GardenaMower = {
  id: string;
  name: string;
  serial: string | null;
  modelType: string | null;
  locationId: string;
  locationName: string;
  battery: number | null;
  batteryState: string | null;
  rfLinkLevel: number | null;
  rfLinkState: string | null;
  state: string | null;
  stateTimestamp: string | null;
  activity: string | null;
  activityTimestamp: string | null;
  operatingHours: number | null;
  lastErrorCode: string | null;
  lastErrorTimestamp: string | null;
  // Rå services for debugging / "alt av statuser"
  raw: Array<{ type: string; id: string; attributes: Record<string, any> }>;
};

export type GardenaSnapshot = {
  ok: boolean;
  error?: string;
  fetchedAt: string;
  locations: Array<{ id: string; name: string }>;
  mowers: GardenaMower[];
};

function attrVal<T = any>(a: GardenaAttr<T>): T | null {
  return a && a.value !== undefined && a.value !== null ? (a.value as T) : null;
}
function attrTs(a: GardenaAttr): string | null {
  return a && a.timestamp ? a.timestamp : null;
}

export async function fetchGardenaSnapshot(): Promise<GardenaSnapshot> {
  const fetchedAt = new Date().toISOString();
  try {
    const locs = await gardenaGet("/locations");
    const locations: Array<{ id: string; name: string }> = (locs?.data ?? []).map((d: any) => ({
      id: String(d.id),
      name: String(d.attributes?.name ?? "Ukjent"),
    }));

    const mowers: GardenaMower[] = [];

    for (const loc of locations) {
      const detail = await gardenaGet(`/locations/${loc.id}`);
      const included: any[] = detail?.included ?? [];
      // Group services by parent device id (relationships.device.data.id)
      const devices = included.filter((x) => x.type === "DEVICE");
      const byDevice = new Map<string, any[]>();
      for (const svc of included) {
        if (svc.type === "DEVICE") continue;
        const devId = svc?.relationships?.device?.data?.id;
        if (!devId) continue;
        if (!byDevice.has(devId)) byDevice.set(devId, []);
        byDevice.get(devId)!.push(svc);
      }

      for (const dev of devices) {
        const services = byDevice.get(dev.id) ?? [];
        const mowerSvc = services.find((s) => s.type === "MOWER");
        if (!mowerSvc) continue; // bare gressklippere

        const common = services.find((s) => s.type === "COMMON");
        const cAttr = common?.attributes ?? {};
        const mAttr = mowerSvc.attributes ?? {};

        const raw = services.map((s) => ({
          type: String(s.type),
          id: String(s.id),
          attributes: s.attributes ?? {},
        }));

        mowers.push({
          id: String(dev.id),
          name: String(cAttr?.name?.value ?? "Gressklipper"),
          serial: cAttr?.serial?.value ?? null,
          modelType: cAttr?.modelType?.value ?? null,
          locationId: loc.id,
          locationName: loc.name,
          battery: attrVal<number>(cAttr?.batteryLevel),
          batteryState: attrVal<string>(cAttr?.batteryState),
          rfLinkLevel: attrVal<number>(cAttr?.rfLinkLevel),
          rfLinkState: attrVal<string>(cAttr?.rfLinkState),
          state: attrVal<string>(mAttr?.state),
          stateTimestamp: attrTs(mAttr?.state),
          activity: attrVal<string>(mAttr?.activity),
          activityTimestamp: attrTs(mAttr?.activity),
          operatingHours: attrVal<number>(mAttr?.operatingHours),
          lastErrorCode: attrVal<string>(mAttr?.lastErrorCode),
          lastErrorTimestamp: attrTs(mAttr?.lastErrorCode),
          raw,
        });
      }
    }

    return { ok: true, fetchedAt, locations, mowers };
  } catch (e: any) {
    return {
      ok: false,
      error: e?.message ?? "Ukjent feil",
      fetchedAt,
      locations: [],
      mowers: [],
    };
  }
}

/**
 * Send kommando til en gressklipper.
 * Eksempler: START_SECONDS_TO_OVERRIDE (sec), START_DONT_OVERRIDE, PARK_UNTIL_NEXT_TASK,
 * PARK_UNTIL_FURTHER_NOTICE, RESUME_SCHEDULE.
 */
export async function sendMowerCommand(
  serviceId: string,
  command: string,
  seconds?: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = await getAccessToken();
    const key = process.env.GARDENA_APP_KEY!;
    const body = {
      data: {
        type: "MOWER_CONTROL",
        id: `cmd-${Date.now()}`,
        attributes: {
          command,
          ...(seconds ? { seconds } : {}),
        },
      },
    };
    const res = await fetch(`${API_BASE}/command/${serviceId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Api-Key": key,
        "Content-Type": "application/vnd.api+json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok && res.status !== 202) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Ukjent feil" };
  }
}
