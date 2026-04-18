import { supabaseAdmin } from "@/integrations/supabase/client.server";
import crypto from "crypto";

/**
 * Jaguar InControl (IFAS) connection storage.
 *
 * Disclaimer: Jaguar/Land Rover do not publish an official open API for end-users.
 * The endpoints below are the same ones the official Jaguar/InControl mobile app
 * uses, and are documented by the open-source `jlrpy` community library:
 *   https://github.com/ardevd/jlrpy
 *
 * The household-wide single-row pattern mirrors what we already do for Strava
 * and Homey: there is one Jaguar account per household, gated by the house
 * password (no Supabase users in this app).
 */

export type JaguarConnection = {
  id: string;
  email: string;
  password_encrypted: string;
  access_token: string | null;
  refresh_token: string | null;
  authorization_token: string | null;
  device_id: string;
  user_id_jaguar: string | null;
  vin: string | null;
  vehicle_nickname: string | null;
  expires_at: string | null;
  updated_at: string;
};

const TABLE = "jaguar_connections" as const;

// ── Encryption helpers ────────────────────────────────────────────────
function getKey(): Buffer {
  const secret =
    process.env.HOUSE_RIIS_PASSWORD ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "fallback";
  return crypto.createHash("sha256").update(`${secret}::jaguar-v1`).digest();
}

export function encryptPassword(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decryptPassword(payload: string): string {
  const [ivB64, tagB64, encB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !encB64) throw new Error("Ugyldig kryptert passord");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const enc = Buffer.from(encB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

// ── DB helpers ────────────────────────────────────────────────────────
export async function getJaguarConnection(): Promise<JaguarConnection | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE as any)
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as JaguarConnection | null) ?? null;
}

export async function saveJaguarConnection(input: {
  email: string;
  password: string;
}): Promise<JaguarConnection> {
  // Replace the single household row
  await supabaseAdmin
    .from(TABLE as any)
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  const password_encrypted = encryptPassword(input.password);
  const device_id = crypto.randomUUID();

  const { data, error } = await supabaseAdmin
    .from(TABLE as any)
    .insert({
      email: input.email.trim().toLowerCase(),
      password_encrypted,
      device_id,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as JaguarConnection;
}

export async function deleteJaguarConnection() {
  const { error } = await supabaseAdmin
    .from(TABLE as any)
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw new Error(error.message);
}

export async function updateJaguarTokens(
  id: string,
  patch: Partial<
    Pick<
      JaguarConnection,
      "access_token" | "refresh_token" | "authorization_token" | "expires_at" | "user_id_jaguar" | "vin" | "vehicle_nickname"
    >
  >,
) {
  const { error } = await supabaseAdmin
    .from(TABLE as any)
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);
}
