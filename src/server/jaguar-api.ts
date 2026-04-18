/**
 * Jaguar InControl (IFAS) API client.
 *
 * These are the same HTTPS endpoints the official Jaguar mobile app uses.
 * They are not officially published by Jaguar Land Rover, but have been
 * documented and maintained by the community via the `jlrpy` Python library:
 *   https://github.com/ardevd/jlrpy
 *
 * Auth is a 3-step ceremony:
 *   1) IFAS  — exchange email + password for an access_token (and refresh_token)
 *   2) IFOP  — register the device + get an authorization_token tied to the device
 *   3) IF9   — fetch user profile (gives us the Jaguar user_id used for vehicle calls)
 */

const IFAS_BASE = "https://ifas.prod-row.jlrmotor.com/ifas/jlr";
const IFOP_BASE = "https://ifop.prod-row.jlrmotor.com/ifop/jlr";
const IF9_BASE = "https://if9.prod-row.jlrmotor.com/if9/jlr";

const BASIC_AUTH = "Basic YXM6YXNwYXNz"; // "as:aspass" — the public client used by the JLR mobile app

export type JaguarAuthResult = {
  access_token: string;
  refresh_token: string;
  authorization_token: string;
  expires_at: string; // ISO
  user_id_jaguar: string;
  vehicles: Array<{ vin: string; role: string | null; nickname: string | null }>;
};

export type JaguarVehicleStatus = {
  // Battery / range
  batteryLevelPct: number | null;
  rangeKm: number | null;
  isCharging: boolean | null;
  chargingStatus: string | null;
  pluggedIn: boolean | null;
  timeToFullChargeMinutes: number | null;
  // Climate / lock / doors
  climateActive: boolean | null;
  cabinTempC: number | null;
  isLocked: boolean | null;
  doorsClosed: boolean | null;
  windowsClosed: boolean | null;
  // Position
  latitude: number | null;
  longitude: number | null;
  // Odometer
  odometerKm: number | null;
  // Tyres
  tyrePressuresOk: boolean | null;
  // Service
  serviceDistanceKm: number | null;
  fetchedAt: string; // ISO
};

// ── 1. IFAS auth ──────────────────────────────────────────────────────
async function ifasAuth(email: string, password: string) {
  const res = await fetch(`${IFAS_BASE}/tokens`, {
    method: "POST",
    headers: {
      Authorization: BASIC_AUTH,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Device-Id": crypto.randomUUID(),
      "Connection": "close",
    },
    body: JSON.stringify({
      grant_type: "password",
      username: email,
      password,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Jaguar-innlogging avslått (HTTP ${res.status}). Sjekk e-post og passord. Detaljer: ${text.slice(0, 200)}`,
    );
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token: string;
    authorization_token?: string;
    expires_in: number;
    token_type: string;
  };
}

// ── 2. IFOP register device ───────────────────────────────────────────
async function ifopRegisterDevice(args: {
  email: string;
  accessToken: string;
  deviceId: string;
  authorizationToken?: string;
}) {
  const res = await fetch(`${IFOP_BASE}/users/${encodeURIComponent(args.email)}/clients`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Device-Id": args.deviceId,
    },
    body: JSON.stringify({
      access_token: args.accessToken,
      authorization_token: args.authorizationToken ?? args.accessToken,
      expires_in: "86400",
      deviceID: args.deviceId,
    }),
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(
      `Jaguar enhetsregistrering feilet (HTTP ${res.status}): ${text.slice(0, 200)}`,
    );
  }
}

// ── 3. IF9 user profile ───────────────────────────────────────────────
async function if9GetUser(args: { email: string; accessToken: string; deviceId: string }) {
  const res = await fetch(`${IF9_BASE}/users?loginName=${encodeURIComponent(args.email)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      Accept: "application/vnd.wirelesscar.ngtp.if9.User-v3+json",
      "Content-Type": "application/json",
      "X-Device-Id": args.deviceId,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jaguar bruker-oppslag feilet (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as { userId: string };
}

// ── Vehicles ──────────────────────────────────────────────────────────
async function if9GetVehicles(args: { userId: string; accessToken: string; deviceId: string }) {
  const res = await fetch(`${IF9_BASE}/users/${args.userId}/vehicles?primaryOnly=true`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      Accept: "application/json",
      "X-Device-Id": args.deviceId,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jaguar kjøretøy-oppslag feilet (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    vehicles: Array<{ vin: string; role?: string }>;
  };
  return data.vehicles ?? [];
}

async function if9GetVehicleAttributes(args: { vin: string; accessToken: string; deviceId: string }) {
  const res = await fetch(`${IF9_BASE}/vehicles/${args.vin}/attributes`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      Accept: "application/vnd.ngtp.org.VehicleAttributes-v8+json",
      "X-Device-Id": args.deviceId,
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as { nickname?: string; vehicleBrand?: string; vehicleType?: string };
}

// ── Full sign-in flow ─────────────────────────────────────────────────
export async function jaguarSignIn(input: {
  email: string;
  password: string;
  deviceId: string;
}): Promise<JaguarAuthResult> {
  const tok = await ifasAuth(input.email, input.password);
  const authorization_token = tok.authorization_token ?? tok.access_token;

  await ifopRegisterDevice({
    email: input.email,
    accessToken: tok.access_token,
    deviceId: input.deviceId,
    authorizationToken: authorization_token,
  });

  const user = await if9GetUser({
    email: input.email,
    accessToken: tok.access_token,
    deviceId: input.deviceId,
  });

  const rawVehicles = await if9GetVehicles({
    userId: user.userId,
    accessToken: tok.access_token,
    deviceId: input.deviceId,
  });

  const vehicles = await Promise.all(
    rawVehicles.map(async (v) => {
      const attrs = await if9GetVehicleAttributes({
        vin: v.vin,
        accessToken: tok.access_token,
        deviceId: input.deviceId,
      });
      return {
        vin: v.vin,
        role: v.role ?? null,
        nickname: attrs?.nickname ?? null,
      };
    }),
  );

  const expires_at = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString();

  return {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    authorization_token,
    expires_at,
    user_id_jaguar: user.userId,
    vehicles,
  };
}

// ── Refresh ───────────────────────────────────────────────────────────
export async function jaguarRefresh(refreshToken: string) {
  const res = await fetch(`${IFAS_BASE}/tokens`, {
    method: "POST",
    headers: {
      Authorization: BASIC_AUTH,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jaguar token-refresh feilet (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token: string;
    authorization_token?: string;
    expires_in: number;
  };
}

// ── Vehicle status ────────────────────────────────────────────────────
async function fetchJson(url: string, accessToken: string, deviceId: string, accept: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: accept,
      "X-Device-Id": deviceId,
    },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function getVehicleStatus(args: {
  vin: string;
  accessToken: string;
  deviceId: string;
}): Promise<JaguarVehicleStatus> {
  const [statusRes, positionRes, attrsRes] = await Promise.all([
    fetchJson(
      `${IF9_BASE}/vehicles/${args.vin}/status?includeInactive=true`,
      args.accessToken,
      args.deviceId,
      "application/vnd.ngtp.org.if9.healthstatus-v4+json",
    ),
    fetchJson(
      `${IF9_BASE}/vehicles/${args.vin}/position`,
      args.accessToken,
      args.deviceId,
      "application/json",
    ),
    fetchJson(
      `${IF9_BASE}/vehicles/${args.vin}/attributes`,
      args.accessToken,
      args.deviceId,
      "application/vnd.ngtp.org.VehicleAttributes-v8+json",
    ),
  ]);

  // Status payload has both `vehicleStatus` (legacy) and `vehicleStatus.coreStatus`/`evStatus` (new)
  const status = (statusRes as any) ?? {};
  const coreList: Array<{ key: string; value: string }> =
    status?.vehicleStatus?.coreStatus ?? status?.vehicleStatus ?? [];
  const evList: Array<{ key: string; value: string }> = status?.vehicleStatus?.evStatus ?? [];

  const all: Array<{ key: string; value: string }> = [
    ...(Array.isArray(coreList) ? coreList : []),
    ...(Array.isArray(evList) ? evList : []),
  ];

  const get = (k: string): string | null => {
    const hit = all.find((x) => x?.key === k);
    return hit?.value ?? null;
  };
  const num = (k: string): number | null => {
    const v = get(k);
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const bool = (k: string, trueWhen: string[]): boolean | null => {
    const v = get(k);
    if (v === null) return null;
    return trueWhen.includes(v.toUpperCase());
  };

  // Position
  const pos = (positionRes as any)?.position ?? {};
  const latitude =
    typeof pos?.latitude === "number"
      ? pos.latitude
      : pos?.latitude
        ? Number(pos.latitude)
        : null;
  const longitude =
    typeof pos?.longitude === "number"
      ? pos.longitude
      : pos?.longitude
        ? Number(pos.longitude)
        : null;

  // Odometer is reported in meters in the IF9 status
  const odoMeters = num("ODOMETER_METER");
  const odoKm = num("ODOMETER") ?? (odoMeters !== null ? Math.round(odoMeters / 1000) : null);

  // EV range: EV_RANGE_ON_BATTERY_KM
  const rangeKm =
    num("EV_RANGE_ON_BATTERY_KM") ??
    num("DISTANCE_TO_EMPTY_FUEL") ??
    null;

  const batteryLevelPct = num("EV_STATE_OF_CHARGE");
  const chargingStatusRaw = get("EV_CHARGING_STATUS");
  const isCharging = chargingStatusRaw ? chargingStatusRaw.toUpperCase() === "CHARGING" : null;
  const pluggedIn = bool("EV_IS_PLUGGED_IN", ["TRUE"]);
  const timeToFullChargeMinutes = num("EV_MINUTES_TO_FULLY_CHARGED");

  const climateActive = bool("CLIMATE_STATUS_REMOTE_HEAT_COOL_STATUS", [
    "HEATING",
    "COOLING",
    "RUNNING",
    "ACTIVE",
  ]);
  const cabinTempC = num("CLIMATE_STATUS_VEHICLE_TEMPERATURE_C");

  const isLocked = bool("DOOR_IS_ALL_DOORS_LOCKED", ["TRUE"]);
  const doorsClosed =
    bool("DOOR_FRONT_LEFT_POSITION", ["CLOSED"]) !== false &&
    bool("DOOR_FRONT_RIGHT_POSITION", ["CLOSED"]) !== false &&
    bool("DOOR_REAR_LEFT_POSITION", ["CLOSED"]) !== false &&
    bool("DOOR_REAR_RIGHT_POSITION", ["CLOSED"]) !== false
      ? true
      : false;
  const windowsClosed =
    bool("WINDOW_FRONT_LEFT_STATUS", ["CLOSED", "FULLYCLOSED"]) !== false &&
    bool("WINDOW_FRONT_RIGHT_STATUS", ["CLOSED", "FULLYCLOSED"]) !== false
      ? true
      : false;

  const tyresOk =
    bool("TYRE_PRESSURE_STATUS_FRONT_LEFT", ["NORMAL"]) !== false &&
    bool("TYRE_PRESSURE_STATUS_FRONT_RIGHT", ["NORMAL"]) !== false &&
    bool("TYRE_PRESSURE_STATUS_REAR_LEFT", ["NORMAL"]) !== false &&
    bool("TYRE_PRESSURE_STATUS_REAR_RIGHT", ["NORMAL"]) !== false
      ? true
      : false;

  const serviceDistanceKm = num("EXT_KILOMETERS_TO_SERVICE");

  return {
    batteryLevelPct,
    rangeKm,
    isCharging,
    chargingStatus: chargingStatusRaw,
    pluggedIn,
    timeToFullChargeMinutes,
    climateActive,
    cabinTempC,
    isLocked,
    doorsClosed,
    windowsClosed,
    latitude,
    longitude,
    odometerKm: odoKm,
    tyrePressuresOk: tyresOk,
    serviceDistanceKm,
    fetchedAt: new Date().toISOString(),
  };
}
