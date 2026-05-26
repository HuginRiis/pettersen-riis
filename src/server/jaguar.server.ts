/**
 * Jaguar Land Rover InControl Remote API.
 * Server-only — bruker JAGUAR_EMAIL / JAGUAR_PASSWORD / JAGUAR_PIN.
 *
 * Auth: IFAS (oauth tokens) -> IFOP (registreringer) -> IF9 (data + kommandoer).
 * Region: EU/ROW endpoints (prod-row).
 */
import { createHash, createHmac, randomUUID } from "crypto";
import { withApiLog } from "./api-call-log.server";

const IFAS = "https://ifas.prod-row.jlrmotor.com/ifas";
const IFOP = "https://ifop.prod-row.jlrmotor.com/ifop";
const IF9 = "https://if9.prod-row.jlrmotor.com/if9";

type Tokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user_id: string;
  device_id: string;
};

let cached: Tokens | null = null;

function deviceIdFor(email: string): string {
  // Stabil UUID-v4-lignende streng avledet av e-post slik at JLR-bakgrunnen
  // kjenner oss igjen mellom kall.
  const h = createHash("sha256").update(`jaguar-device:${email}`).digest("hex");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    "4" + h.slice(13, 16),
    "a" + h.slice(17, 20),
    h.slice(20, 32),
  ].join("-");
}

async function authenticate(): Promise<Tokens> {
  const email = process.env.JAGUAR_EMAIL;
  const password = process.env.JAGUAR_PASSWORD;
  if (!email || !password) throw new Error("Mangler JAGUAR_EMAIL / JAGUAR_PASSWORD");

  const device_id = deviceIdFor(email);

  // 1) Hent oauth-tokens (Basic auth med fast public client-id).
  const tokenRes = await fetch(`${IFAS}/jlr/tokens`, {
    method: "POST",
    headers: {
      Authorization: "Basic YXM6YXNwYXNz", // JLR public client id
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Device-Id": device_id,
    },
    body: JSON.stringify({
      grant_type: "password",
      username: email,
      password,
    }),
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text().catch(() => "");
    throw new Error(`JLR auth ${tokenRes.status}: ${t.slice(0, 200)}`);
  }
  const tok: any = await tokenRes.json();
  const access_token: string = tok.access_token;
  const refresh_token: string = tok.refresh_token;
  const expires_in: number = Number(tok.expires_in ?? 3600);

  // 2) Registrer enhet.
  await fetch(`${IFOP}/jlr/users/${encodeURIComponent(email)}/clients`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Device-Id": device_id,
    },
    body: JSON.stringify({
      access_token,
      authorization_token: tok.authorization_token,
      expires_in,
      deviceID: device_id,
    }),
  }).catch(() => {});

  // 3) Hent user_id.
  const userRes = await fetch(`${IF9}/jlr/users?loginName=${encodeURIComponent(email)}`, {
    headers: {
      Authorization: `Bearer ${access_token}`,
      Accept: "application/vnd.wirelesscar.ngtp.if9.User-v3+json",
      "X-Device-Id": device_id,
    },
  });
  if (!userRes.ok) {
    const t = await userRes.text().catch(() => "");
    throw new Error(`JLR user ${userRes.status}: ${t.slice(0, 200)}`);
  }
  const user: any = await userRes.json();
  const user_id: string = user.userId;

  cached = {
    access_token,
    refresh_token,
    expires_at: Date.now() + expires_in * 1000,
    user_id,
    device_id,
  };
  return cached;
}

async function getTokens(): Promise<Tokens> {
  if (cached && cached.expires_at - 60_000 > Date.now()) return cached;
  return authenticate();
}

async function ifGet<T = any>(path: string, accept: string): Promise<T> {
  const t = await getTokens();
  const res = await fetch(`${IF9}${path}`, {
    headers: {
      Authorization: `Bearer ${t.access_token}`,
      Accept: accept,
      "X-Device-Id": t.device_id,
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`JLR GET ${path} ${res.status}: ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export type JaguarVehicleSummary = {
  vin: string;
  registrationNumber?: string | null;
  nickname?: string | null;
  level: number | null;
  rangeKm: number | null;
  odometerKm: number | null;
  locked: boolean | null;
  fuelType?: string | null;
  position: { lat: number; lon: number; ts?: string | null } | null;
  statusAt: string;
  raw: {
    status: any;
    attributes: any;
    position: any;
  };
};

export type JaguarSnapshot = {
  ok: boolean;
  error?: string;
  fetchedAt: string;
  vehicles: JaguarVehicleSummary[];
};

function numFromStatus(status: any, key: string): number | null {
  const arr: any[] = status?.vehicleStatus?.coreStatus
    ?? status?.vehicleStatus
    ?? [];
  if (Array.isArray(arr)) {
    const hit = arr.find((x) => x?.key === key);
    const v = hit?.value;
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function strFromStatus(status: any, key: string): string | null {
  const arr: any[] = status?.vehicleStatus?.coreStatus
    ?? status?.vehicleStatus
    ?? [];
  if (Array.isArray(arr)) {
    const hit = arr.find((x) => x?.key === key);
    return hit?.value ?? null;
  }
  return null;
}

export const fetchJaguarSnapshot = withApiLog(
  "jaguar",
  "getSnapshot",
  async (): Promise<JaguarSnapshot> => {
    const fetchedAt = new Date().toISOString();
    try {
      const t = await getTokens();
      const list: any = await ifGet(
        `/jlr/users/${t.user_id}/vehicles?primaryOnly=true`,
        "application/vnd.wirelesscar.ngtp.if9.User-v3+json",
      );
      const vins: string[] = (list?.vehicles ?? [])
        .map((v: any) => v?.vin)
        .filter(Boolean);

      const vehicles: JaguarVehicleSummary[] = [];
      for (const vin of vins) {
        try {
          const [status, attributes, position] = await Promise.all([
            ifGet(
              `/jlr/vehicles/${vin}/status?includeInactive=true`,
              "application/vnd.ngtp.org.if9.healthstatus-v3+json",
            ).catch(() => null),
            ifGet(
              `/jlr/vehicles/${vin}/attributes`,
              "application/vnd.ngtp.org.VehicleAttributes-v8+json",
            ).catch(() => null),
            ifGet(
              `/jlr/vehicles/${vin}/position`,
              "application/json",
            ).catch(() => null),
          ]);

          const level =
            numFromStatus(status, "EV_STATE_OF_CHARGE") ??
            numFromStatus(status, "FUEL_LEVEL_PERC");
          const rangeKm =
            (numFromStatus(status, "EV_RANGE_ON_BATTERY_KM") ??
              numFromStatus(status, "DISTANCE_TO_EMPTY_FUEL")) || null;
          const odoM = numFromStatus(status, "ODOMETER_METER");
          const odoMi = numFromStatus(status, "ODOMETER_MILES");
          const odometerKm = odoM != null ? Math.round(odoM / 1000)
            : odoMi != null ? Math.round(odoMi * 1.609) : null;
          const lockedStr = strFromStatus(status, "DOOR_IS_ALL_DOORS_LOCKED");
          const locked = lockedStr == null ? null : lockedStr.toUpperCase() === "TRUE";

          const pos = position?.position ?? position;
          const lat = pos?.latitude;
          const lon = pos?.longitude;
          const positionObj =
            typeof lat === "number" && typeof lon === "number"
              ? { lat, lon, ts: pos?.timestamp ?? null }
              : null;

          vehicles.push({
            vin,
            registrationNumber: attributes?.registrationNumber ?? null,
            nickname: attributes?.nickname ?? null,
            fuelType: attributes?.fuelType ?? null,
            level,
            rangeKm,
            odometerKm,
            locked,
            position: positionObj,
            statusAt: status?.lastUpdatedTime ?? fetchedAt,
            raw: { status, attributes, position },
          });
        } catch (e: any) {
          vehicles.push({
            vin,
            level: null,
            rangeKm: null,
            odometerKm: null,
            locked: null,
            position: null,
            statusAt: fetchedAt,
            raw: { status: null, attributes: null, position: null },
          });
        }
      }

      return { ok: true, fetchedAt, vehicles };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Ukjent feil", fetchedAt, vehicles: [] };
    }
  },
);

// ───────── Kommandoer (krever PIN) ─────────

type CommandToken = { token: string; expiresAt: number };

function sha512Hex(input: string): string {
  return createHash("sha512").update(input).digest("hex").toUpperCase();
}

async function getCommandToken(service: "REON" | "RDU" | "RDL" | "CP" | "HBLF"): Promise<CommandToken> {
  const pin = process.env.JAGUAR_PIN;
  if (!pin) throw new Error("Mangler JAGUAR_PIN");
  const t = await getTokens();

  // JLR: hash av PIN + VIN via spesielle service-tokens (REON/RDU/RDL/CP/HBLF).
  // Body krever {serviceName, pin} for de fleste. Bruker pin direkte.
  const body = { serviceName: service, pin };
  const res = await fetch(
    `${IF9}/jlr/vehicles/${t.user_id}/users/${t.user_id}/authenticate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t.access_token}`,
        "Content-Type": "application/vnd.wirelesscar.ngtp.if9.AuthenticateRequest-v2+json",
        Accept: "application/vnd.wirelesscar.ngtp.if9.AuthenticationResponse-v2+json",
        "X-Device-Id": t.device_id,
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`JLR cmd-auth ${service} ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json: any = await res.json();
  return { token: json.token, expiresAt: Date.now() + 5 * 60 * 1000 };
}

export const sendJaguarCommand = withApiLog(
  "jaguar",
  "sendCommand",
  async (input: { vin: string; command: "LOCK" | "UNLOCK" | "CLIMATE_START" | "CLIMATE_STOP" | "HONK_FLASH" }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const t = await getTokens();
      const map: Record<string, { service: any; path: string; accept: string }> = {
        LOCK: { service: "RDL", path: "lock", accept: "application/vnd.wirelesscar.ngtp.if9.ServiceStatus-v4+json" },
        UNLOCK: { service: "RDU", path: "unlock", accept: "application/vnd.wirelesscar.ngtp.if9.ServiceStatus-v4+json" },
        CLIMATE_START: { service: "REON", path: "engineOn", accept: "application/vnd.wirelesscar.ngtp.if9.ServiceStatus-v4+json" },
        CLIMATE_STOP: { service: "REON", path: "engineOff", accept: "application/vnd.wirelesscar.ngtp.if9.ServiceStatus-v4+json" },
        HONK_FLASH: { service: "HBLF", path: "honkBlink", accept: "application/vnd.wirelesscar.ngtp.if9.ServiceStatus-v4+json" },
      };
      const m = map[input.command];
      const ct = await getCommandToken(m.service as any);
      const res = await fetch(`${IF9}/jlr/vehicles/${input.vin}/${m.path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${t.access_token}`,
          "Content-Type": "application/vnd.wirelesscar.ngtp.if9.StartServiceConfiguration-v3+json",
          Accept: m.accept,
          "X-Device-Id": t.device_id,
        },
        body: JSON.stringify({ token: ct.token }),
      });
      if (!res.ok && res.status !== 202) {
        const txt = await res.text().catch(() => "");
        return { ok: false, error: `${res.status}: ${txt.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Ukjent feil" };
    }
  },
);
