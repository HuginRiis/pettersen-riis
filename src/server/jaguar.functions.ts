import { createServerFn } from "@tanstack/react-start";
import {
  fetchJaguarSnapshot,
  sendJaguarCommand,
  requestJaguarOtp,
  verifyJaguarOtp,
  setJaguarRefreshToken,
  getJaguarAuthStatus,
} from "@/server/jaguar.server";
import { probeJaguarPortal } from "@/server/jaguar-portal.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const probeJaguarPortalFn = createServerFn({ method: "GET" }).handler(async () => {
  return await probeJaguarPortal();
});

export const getJaguarSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  return await fetchJaguarSnapshot();
});

export const getJaguarHistory = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("jaguar_snapshots")
    .select("vin, fetched_at, ok, error, level, range_km, odometer_km, locked, position_lat, position_lon")
    .order("fetched_at", { ascending: false })
    .limit(168);
  if (error) return { ok: false, error: error.message, rows: [] as any[] };
  return { ok: true, rows: data ?? [] };
});

export const sendJaguarCommandFn = createServerFn({ method: "POST" })
  .inputValidator((data: { vin: string; command: "LOCK" | "UNLOCK" | "CLIMATE_START" | "CLIMATE_STOP" | "HONK_FLASH" }) => ({
    vin: String(data?.vin ?? "").trim(),
    command: data?.command,
  }))
  .handler(async ({ data }) => {
    if (!data.vin || !data.command) return { ok: false, error: "Mangler vin/command" };
    return await sendJaguarCommand(data);
  });

export const getJaguarAuthStatusFn = createServerFn({ method: "GET" }).handler(async () => {
  return await getJaguarAuthStatus();
});

export const requestJaguarOtpFn = createServerFn({ method: "POST" }).handler(async () => {
  return await requestJaguarOtp();
});

export const verifyJaguarOtpFn = createServerFn({ method: "POST" })
  .inputValidator((data: { otp: string }) => ({ otp: String(data?.otp ?? "").trim() }))
  .handler(async ({ data }) => {
    return await verifyJaguarOtp(data.otp);
  });

export const setJaguarRefreshTokenFn = createServerFn({ method: "POST" })
  .inputValidator((data: { refresh_token: string }) => ({
    refresh_token: String(data?.refresh_token ?? "").trim(),
  }))
  .handler(async ({ data }) => {
    return await setJaguarRefreshToken(data.refresh_token);
  });
