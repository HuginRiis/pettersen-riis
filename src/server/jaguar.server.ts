/**
 * Jaguar Land Rover InControl Remote API.
 *
 * Bruker den nye Pivotal-auth-flyten (2024+) med engangskode (OTP) på e-post.
 * Tokens lagres i tabellen `jaguar_auth` (singleton, id=1) så vi kan re-bruke
 * refresh-token (varer ~30 dager) og slippe ny OTP hver gang.
 *
 * Fallback: bruker kan lime inn et eksisterende refresh-token (f.eks. hentet
 * via jlrpy lokalt) hvis OTP-endepunktet endrer seg.
 */
import { createHash } from "crypto";
import { withApiLog } from "./api-call-log.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const IFAS = "https://ifas.prod-row.jlrmotor.com/ifas";
const IFOP = "https://ifop.prod-row.jlrmotor.com/ifop";
const IF9 = "https://if9.prod-row.jlrmotor.com/if9";
const BASIC = "Basic YXM6YXNwYXNz"; // JLR public client id (as:aspass)

type AuthRow = {
  email: string | null;
  device_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  authorization_token: string | null;
  user_id: string | null;
  expires_at: string | null;
};

function deviceIdFor(email: string): string {
  const h = createHash("sha256").update(`jaguar-device:${email}`).digest("hex");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    "4" + h.slice(13, 16),
    "a" + h.slice(17, 20),
    h.slice(20, 32),
  ].join("-");
}

async function loadAuth(): Promise<AuthRow | null> {
  const { data } = await supabaseAdmin
    .from("jaguar_auth")
    .select("email, device_id, access_token, refresh_token, authorization_token, user_id, expires_at")
    .eq("id", 1)
    .maybeSingle();
  return (data as AuthRow) ?? null;
}

async function saveAuth(patch: Partial<AuthRow> & Record<string, any>) {
  await supabaseAdmin
    .from("jaguar_auth")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", 1);
}

async function registerDevice(email: string, access_token: string, authorization_token: string | null, expires_in: number, device_id: string) {
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
      authorization_token,
      expires_in,
      deviceID: device_id,
    }),
  }).catch(() => {});
}

async function fetchUserId(email: string, access_token: string, device_id: string): Promise<string> {
  const res = await fetch(`${IF9}/jlr/users?loginName=${encodeURIComponent(email)}`, {
    headers: {
      Authorization: `Bearer ${access_token}`,
      Accept: "application/vnd.wirelesscar.ngtp.if9.User-v3+json",
      "X-Device-Id": device_id,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`JLR user ${res.status}: ${t.slice(0, 200)}`);
  }
  const j: any = await res.json();
  return j.userId;
}

async function refreshAccessToken(refresh_token: string, device_id: string) {
  const res = await fetch(`${IFAS}/jlr/tokens`, {
    method: "POST",
    headers: {
      Authorization: BASIC,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Device-Id": device_id,
    },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`JLR refresh ${res.status}: ${t.slice(0, 200)}`);
  }
  return (await res.json()) as any;
}

// ───────── OTP-flyt ─────────

export async function requestJaguarOtp(): Promise<{ ok: boolean; error?: string }> {
  try {
    const email = process.env.JAGUAR_EMAIL;
    if (!email) return { ok: false, error: "JAGUAR_EMAIL mangler" };
    const device_id = deviceIdFor(email);

    // Be JLR sende OTP på e-post.
    const res = await fetch(`${IFAS}/jlr/tokens/otp`, {
      method: "POST",
      headers: {
        Authorization: BASIC,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Device-Id": device_id,
      },
      body: JSON.stringify({ serviceName: "IFOP", email }),
    });
    if (!res.ok && res.status !== 202 && res.status !== 204) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `${res.status}: ${t.slice(0, 200)}` };
    }
    await saveAuth({
      email,
      device_id,
      pending_email: email,
      pending_started_at: new Date().toISOString(),
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Ukjent feil" };
  }
}

export async function verifyJaguarOtp(otp: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const code = (otp || "").trim();
    if (!code) return { ok: false, error: "Mangler kode" };
    const email = process.env.JAGUAR_EMAIL;
    if (!email) return { ok: false, error: "JAGUAR_EMAIL mangler" };
    const device_id = deviceIdFor(email);

    // Bytter OTP mot tokens.
    const res = await fetch(`${IFAS}/jlr/tokens`, {
      method: "POST",
      headers: {
        Authorization: BASIC,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Device-Id": device_id,
      },
      body: JSON.stringify({
        grant_type: "otp",
        username: email,
        otp: code,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `${res.status}: ${t.slice(0, 200)}` };
    }
    const tok: any = await res.json();
    const access_token: string = tok.access_token;
    const refresh_token: string = tok.refresh_token;
    const authorization_token: string | null = tok.authorization_token ?? null;
    const expires_in: number = Number(tok.expires_in ?? 3600);

    await registerDevice(email, access_token, authorization_token, expires_in, device_id);
    const user_id = await fetchUserId(email, access_token, device_id);

    await saveAuth({
      email,
      device_id,
      access_token,
      refresh_token,
      authorization_token,
      user_id,
      expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      pending_email: null,
      pending_started_at: null,
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Ukjent feil" };
  }
}

export async function setJaguarRefreshToken(refresh_token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const rt = (refresh_token || "").trim();
    if (!rt) return { ok: false, error: "Mangler refresh-token" };
    const email = process.env.JAGUAR_EMAIL;
    if (!email) return { ok: false, error: "JAGUAR_EMAIL mangler" };
    const device_id = deviceIdFor(email);

    const tok = await refreshAccessToken(rt, device_id);
    const access_token: string = tok.access_token;
    const new_refresh: string = tok.refresh_token ?? rt;
    const authorization_token: string | null = tok.authorization_token ?? null;
    const expires_in: number = Number(tok.expires_in ?? 3600);

    await registerDevice(email, access_token, authorization_token, expires_in, device_id);
    const user_id = await fetchUserId(email, access_token, device_id);

    await saveAuth({
      email,
      device_id,
      access_token,
      refresh_token: new_refresh,
      authorization_token,
      user_id,
      expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      pending_email: null,
      pending_started_at: null,
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Ukjent feil" };
  }
}

export async function getJaguarAuthStatus(): Promise<{
  connected: boolean;
  email: string | null;
  expiresAt: string | null;
  pendingOtp: boolean;
}> {
  const row = await loadAuth();
  return {
    connected: !!(row?.refresh_token && row?.user_id),
    email: row?.email ?? process.env.JAGUAR_EMAIL ?? null,
    expiresAt: row?.expires_at ?? null,
    pendingOtp: !!row && !row.refresh_token && !!(row as any).pending_email,
  };
}

// ───────── Auth-runtime: gyldig access-token ─────────

async function ensureAccessToken(): Promise<{ access_token: string; user_id: string; device_id: string }> {
  const row = await loadAuth();
  if (!row?.refresh_token) {
    throw new Error("Ikke koblet til Jaguar. Logg inn via OTP eller lim inn refresh-token.");
  }
  const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  const device_id = row.device_id ?? deviceIdFor(row.email ?? process.env.JAGUAR_EMAIL ?? "");
  if (row.access_token && exp - 60_000 > Date.now() && row.user_id) {
    return { access_token: row.access_token, user_id: row.user_id, device_id };
  }
  // Refresh
  const tok = await refreshAccessToken(row.refresh_token, device_id);
  const access_token: string = tok.access_token;
  const new_refresh: string = tok.refresh_token ?? row.refresh_token;
  const authorization_token: string | null = tok.authorization_token ?? null;
  const expires_in: number = Number(tok.expires_in ?? 3600);
  const email = row.email ?? process.env.JAGUAR_EMAIL ?? "";
  await registerDevice(email, access_token, authorization_token, expires_in, device_id);
  const user_id = row.user_id ?? (await fetchUserId(email, access_token, device_id));
  await saveAuth({
    access_token,
    refresh_token: new_refresh,
    authorization_token,
    user_id,
    expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
  });
  return { access_token, user_id, device_id };
}

async function ifGet<T = any>(path: string, accept: string): Promise<T> {
  const t = await ensureAccessToken();
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
  raw: { status: any; attributes: any; position: any };
};

export type JaguarSnapshot = {
  ok: boolean;
  error?: string;
  fetchedAt: string;
  vehicles: JaguarVehicleSummary[];
};

function numFromStatus(status: any, key: string): number | null {
  const arr: any[] = status?.vehicleStatus?.coreStatus ?? status?.vehicleStatus ?? [];
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
  const arr: any[] = status?.vehicleStatus?.coreStatus ?? status?.vehicleStatus ?? [];
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
      const t = await ensureAccessToken();
      const list: any = await ifGet(
        `/jlr/users/${t.user_id}/vehicles?primaryOnly=true`,
        "application/vnd.wirelesscar.ngtp.if9.User-v3+json",
      );
      const vins: string[] = (list?.vehicles ?? []).map((v: any) => v?.vin).filter(Boolean);

      const vehicles: JaguarVehicleSummary[] = [];
      for (const vin of vins) {
        try {
          const [status, attributes, position] = await Promise.all([
            ifGet(`/jlr/vehicles/${vin}/status?includeInactive=true`, "application/vnd.ngtp.org.if9.healthstatus-v3+json").catch(() => null),
            ifGet(`/jlr/vehicles/${vin}/attributes`, "application/vnd.ngtp.org.VehicleAttributes-v8+json").catch(() => null),
            ifGet(`/jlr/vehicles/${vin}/position`, "application/json").catch(() => null),
          ]);
          const level = numFromStatus(status, "EV_STATE_OF_CHARGE") ?? numFromStatus(status, "FUEL_LEVEL_PERC");
          const rangeKm = (numFromStatus(status, "EV_RANGE_ON_BATTERY_KM") ?? numFromStatus(status, "DISTANCE_TO_EMPTY_FUEL")) || null;
          const odoM = numFromStatus(status, "ODOMETER_METER");
          const odoMi = numFromStatus(status, "ODOMETER_MILES");
          const odometerKm = odoM != null ? Math.round(odoM / 1000) : odoMi != null ? Math.round(odoMi * 1.609) : null;
          const lockedStr = strFromStatus(status, "DOOR_IS_ALL_DOORS_LOCKED");
          const locked = lockedStr == null ? null : lockedStr.toUpperCase() === "TRUE";

          const pos = (position as any)?.position ?? position;
          const lat = pos?.latitude;
          const lon = pos?.longitude;
          const positionObj = typeof lat === "number" && typeof lon === "number"
            ? { lat, lon, ts: pos?.timestamp ?? null }
            : null;

          vehicles.push({
            vin,
            registrationNumber: (attributes as any)?.registrationNumber ?? null,
            nickname: (attributes as any)?.nickname ?? null,
            fuelType: (attributes as any)?.fuelType ?? null,
            level,
            rangeKm,
            odometerKm,
            locked,
            position: positionObj,
            statusAt: (status as any)?.lastUpdatedTime ?? fetchedAt,
            raw: { status, attributes, position },
          });
        } catch {
          vehicles.push({
            vin, level: null, rangeKm: null, odometerKm: null, locked: null,
            position: null, statusAt: fetchedAt,
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

async function getCommandToken(service: "REON" | "RDU" | "RDL" | "CP" | "HBLF") {
  const pin = process.env.JAGUAR_PIN;
  if (!pin) throw new Error("Mangler JAGUAR_PIN");
  const t = await ensureAccessToken();
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
      body: JSON.stringify({ serviceName: service, pin }),
    },
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`JLR cmd-auth ${service} ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json: any = await res.json();
  return { token: json.token as string, t };
}

export const sendJaguarCommand = withApiLog(
  "jaguar",
  "sendCommand",
  async (input: { vin: string; command: "LOCK" | "UNLOCK" | "CLIMATE_START" | "CLIMATE_STOP" | "HONK_FLASH" }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const map: Record<string, { service: any; path: string; accept: string }> = {
        LOCK: { service: "RDL", path: "lock", accept: "application/vnd.wirelesscar.ngtp.if9.ServiceStatus-v4+json" },
        UNLOCK: { service: "RDU", path: "unlock", accept: "application/vnd.wirelesscar.ngtp.if9.ServiceStatus-v4+json" },
        CLIMATE_START: { service: "REON", path: "engineOn", accept: "application/vnd.wirelesscar.ngtp.if9.ServiceStatus-v4+json" },
        CLIMATE_STOP: { service: "REON", path: "engineOff", accept: "application/vnd.wirelesscar.ngtp.if9.ServiceStatus-v4+json" },
        HONK_FLASH: { service: "HBLF", path: "honkBlink", accept: "application/vnd.wirelesscar.ngtp.if9.ServiceStatus-v4+json" },
      };
      const m = map[input.command];
      const { token, t } = await getCommandToken(m.service);
      const res = await fetch(`${IF9}/jlr/vehicles/${input.vin}/${m.path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${t.access_token}`,
          "Content-Type": "application/vnd.wirelesscar.ngtp.if9.StartServiceConfiguration-v3+json",
          Accept: m.accept,
          "X-Device-Id": t.device_id,
        },
        body: JSON.stringify({ token }),
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
