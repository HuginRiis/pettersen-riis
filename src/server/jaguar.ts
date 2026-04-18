import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  decryptPassword,
  deleteJaguarConnection,
  getJaguarConnection,
  saveJaguarConnection,
  updateJaguarTokens,
} from "./jaguar-connection";
import {
  getVehicleStatus,
  jaguarRefresh,
  jaguarSignIn,
  type JaguarVehicleStatus,
} from "./jaguar-api";

// ── House auth gate (same pattern as src/server/auth.ts) ───────────────
type SessionData = { authenticated?: boolean };
function getSessionConfig() {
  const base = process.env.HOUSE_RIIS_PASSWORD ?? "";
  const derived = (base + "::house-riis-session-v1::winter-is-ours").repeat(4).slice(0, 64);
  return {
    password: derived,
    name: "house_riis_session",
    maxAge: 60 * 60 * 24 * 30,
    cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
  };
}
async function requireHouseAuth() {
  const session = await useSession<SessionData>(getSessionConfig());
  if (session.data?.authenticated !== true) {
    throw new Error("Du må logge inn på huset først.");
  }
}

// ── Token freshness ────────────────────────────────────────────────────
async function ensureFreshTokens() {
  const conn = await getJaguarConnection();
  if (!conn) return null;

  const now = Date.now();
  const expiresAt = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;
  if (conn.access_token && expiresAt - now > 60_000) return conn;

  if (!conn.refresh_token) {
    // Need full re-login; tokens are unrecoverable.
    return null;
  }

  try {
    const tok = await jaguarRefresh(conn.refresh_token);
    const newExpires = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString();
    await updateJaguarTokens(conn.id, {
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      authorization_token: tok.authorization_token ?? tok.access_token,
      expires_at: newExpires,
    });
    return {
      ...conn,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      authorization_token: tok.authorization_token ?? tok.access_token,
      expires_at: newExpires,
    };
  } catch {
    // Refresh failed — fall back to a full re-login using stored credentials.
    try {
      const password = decryptPassword(conn.password_encrypted);
      const auth = await jaguarSignIn({
        email: conn.email,
        password,
        deviceId: conn.device_id,
      });
      const primaryVin = auth.vehicles[0]?.vin ?? null;
      const nickname = auth.vehicles[0]?.nickname ?? null;
      await updateJaguarTokens(conn.id, {
        access_token: auth.access_token,
        refresh_token: auth.refresh_token,
        authorization_token: auth.authorization_token,
        expires_at: auth.expires_at,
        user_id_jaguar: auth.user_id_jaguar,
        vin: primaryVin,
        vehicle_nickname: nickname,
      });
      return {
        ...conn,
        access_token: auth.access_token,
        refresh_token: auth.refresh_token,
        authorization_token: auth.authorization_token,
        expires_at: auth.expires_at,
        user_id_jaguar: auth.user_id_jaguar,
        vin: primaryVin,
        vehicle_nickname: nickname,
      };
    } catch {
      return null;
    }
  }
}

// ── Server functions ───────────────────────────────────────────────────
export const getJaguarStatus = createServerFn({ method: "GET" }).handler(async () => {
  await requireHouseAuth();
  const conn = await getJaguarConnection();
  if (!conn) return { connected: false as const };
  return {
    connected: true as const,
    email: conn.email,
    vin: conn.vin,
    vehicleNickname: conn.vehicle_nickname,
  };
});

const loginSchema = z.object({
  email: z.string().trim().email("Ugyldig e-postadresse").max(255),
  password: z.string().min(1, "Passord kreves").max(200),
});

export const connectJaguar = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => loginSchema.parse(input))
  .handler(async ({ data }) => {
    await requireHouseAuth();
    // Save creds first so we can reuse them on refresh failures
    const saved = await saveJaguarConnection({ email: data.email, password: data.password });
    const auth = await jaguarSignIn({
      email: data.email,
      password: data.password,
      deviceId: saved.device_id,
    });
    const primaryVin = auth.vehicles[0]?.vin ?? null;
    const nickname = auth.vehicles[0]?.nickname ?? null;
    await updateJaguarTokens(saved.id, {
      access_token: auth.access_token,
      refresh_token: auth.refresh_token,
      authorization_token: auth.authorization_token,
      expires_at: auth.expires_at,
      user_id_jaguar: auth.user_id_jaguar,
      vin: primaryVin,
      vehicle_nickname: nickname,
    });
    return {
      ok: true as const,
      vin: primaryVin,
      vehicleNickname: nickname,
      vehicleCount: auth.vehicles.length,
    };
  });

export const disconnectJaguar = createServerFn({ method: "POST" }).handler(async () => {
  await requireHouseAuth();
  await deleteJaguarConnection();
  return { ok: true as const };
});

export type JaguarDashboard =
  | { connected: false }
  | {
      connected: true;
      email: string;
      vin: string;
      vehicleNickname: string | null;
      status: JaguarVehicleStatus | null;
      error?: string;
    };

export const getJaguarDashboard = createServerFn({ method: "GET" }).handler(
  async (): Promise<JaguarDashboard> => {
    await requireHouseAuth();
    const conn = await ensureFreshTokens();
    if (!conn || !conn.access_token) return { connected: false };
    if (!conn.vin) {
      return {
        connected: true,
        email: conn.email,
        vin: "",
        vehicleNickname: conn.vehicle_nickname,
        status: null,
        error: "Fant ingen jernhest knyttet til kontoen.",
      };
    }
    try {
      const status = await getVehicleStatus({
        vin: conn.vin,
        accessToken: conn.access_token,
        deviceId: conn.device_id,
      });
      return {
        connected: true,
        email: conn.email,
        vin: conn.vin,
        vehicleNickname: conn.vehicle_nickname,
        status,
      };
    } catch (e) {
      return {
        connected: true,
        email: conn.email,
        vin: conn.vin,
        vehicleNickname: conn.vehicle_nickname,
        status: null,
        error: e instanceof Error ? e.message : "Ukjent feil ved henting av jernhestens tilstand.",
      };
    }
  },
);
