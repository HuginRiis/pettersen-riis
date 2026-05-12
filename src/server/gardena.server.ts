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

export type GardenaSensor = {
  id: string;
  name: string;
  serial: string | null;
  modelType: string | null;
  battery: number | null;
  batteryState: string | null;
  rfLinkLevel: number | null;
  soilHumidity: { value: number | null; timestamp: string | null };
  soilTemperature: { value: number | null; timestamp: string | null };
  ambientTemperature: { value: number | null; timestamp: string | null };
  lightIntensity: { value: number | null; timestamp: string | null };
  raw: Array<{ type: string; id: string; attributes: Record<string, any> }>;
};

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

export type GardenaLocation = {
  id: string;
  name: string;
  lat: number | null;
  lon: number | null;
};

export type GardenaSnapshot = {
  ok: boolean;
  error?: string;
  fetchedAt: string;
  locations: GardenaLocation[];
  mowers: GardenaMower[];
  sensors: GardenaSensor[];
  /** Fallback hjem-koordinater for kart (fra env GARDENA_HOME_LAT/LON eller default Tollnes). */
  homeLat: number;
  homeLon: number;
};

function attrVal<T = any>(a: GardenaAttr<T>): T | null {
  return a && a.value !== undefined && a.value !== null ? (a.value as T) : null;
}
function attrTs(a: GardenaAttr): string | null {
  return a && a.timestamp ? a.timestamp : null;
}

export async function fetchGardenaSnapshot(): Promise<GardenaSnapshot> {
  const fetchedAt = new Date().toISOString();
  const homeLat = Number(process.env.GARDENA_HOME_LAT ?? 59.2096);
  const homeLon = Number(process.env.GARDENA_HOME_LON ?? 9.609);
  try {
    const locs = await gardenaGet("/locations");
    const locations: GardenaLocation[] = (locs?.data ?? []).map((d: any) => ({
      id: String(d.id),
      name: String(d.attributes?.name ?? "Ukjent"),
      lat: typeof d.attributes?.latitude === "number" ? d.attributes.latitude : null,
      lon: typeof d.attributes?.longitude === "number" ? d.attributes.longitude : null,
    }));

    const mowers: GardenaMower[] = [];
    const sensors: GardenaSensor[] = [];

    for (const loc of locations) {
      const detail = await gardenaGet(`/locations/${loc.id}`);
      const included: any[] = detail?.included ?? [];
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
        const common = services.find((s) => s.type === "COMMON");
        const cAttr = common?.attributes ?? {};
        const raw = services.map((s) => ({
          type: String(s.type),
          id: String(s.id),
          attributes: s.attributes ?? {},
        }));

        const mowerSvc = services.find((s) => s.type === "MOWER");
        const sensorSvc = services.find((s) => s.type === "SENSOR");

        if (mowerSvc) {
          const mAttr = mowerSvc.attributes ?? {};
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

        if (sensorSvc) {
          const sAttr = sensorSvc.attributes ?? {};
          sensors.push({
            id: String(dev.id),
            name: String(cAttr?.name?.value ?? "Sensor"),
            serial: cAttr?.serial?.value ?? null,
            modelType: cAttr?.modelType?.value ?? null,
            battery: attrVal<number>(cAttr?.batteryLevel),
            batteryState: attrVal<string>(cAttr?.batteryState),
            rfLinkLevel: attrVal<number>(cAttr?.rfLinkLevel),
            soilHumidity: {
              value: attrVal<number>(sAttr?.soilHumidity),
              timestamp: attrTs(sAttr?.soilHumidity),
            },
            soilTemperature: {
              value: attrVal<number>(sAttr?.soilTemperature),
              timestamp: attrTs(sAttr?.soilTemperature),
            },
            ambientTemperature: {
              value: attrVal<number>(sAttr?.ambientTemperature),
              timestamp: attrTs(sAttr?.ambientTemperature),
            },
            lightIntensity: {
              value: attrVal<number>(sAttr?.lightIntensity),
              timestamp: attrTs(sAttr?.lightIntensity),
            },
            raw,
          });
        }
      }
    }

    return { ok: true, fetchedAt, locations, mowers, sensors, homeLat, homeLon };
  } catch (e: any) {
    return {
      ok: false,
      error: e?.message ?? "Ukjent feil",
      fetchedAt,
      locations: [],
      mowers: [],
      sensors: [],
      homeLat,
      homeLon,
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
