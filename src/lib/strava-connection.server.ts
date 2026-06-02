import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStravaOwnerFromState, isStravaOwner, STRAVA_OWNERS, type StravaOwner } from "@/lib/strava-shared";
import { getStravaCredentials } from "./strava-credentials.server";

export { getStravaCredentials, getStravaOwnerFromState, isStravaOwner, STRAVA_OWNERS, type StravaOwner };

export function createStravaState(owner: StravaOwner, signingSecret: string) {
  const issuedAt = Math.floor(Date.now() / 1000).toString();
  const nonce = randomUUID();
  const payload = `${owner}.${issuedAt}.${nonce}`;
  const signature = createHmac("sha256", signingSecret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifyStravaState(state: string | null, signingSecret: string) {
  if (!state) return false;
  const parts = state.split(".");
  if (parts.length !== 4) return false;
  const [owner, issuedAt, nonce, signature] = parts;
  if (!getStravaOwnerFromState(state)) return false;
  const ageSeconds = Math.floor(Date.now() / 1000) - Number(issuedAt);
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > 600) return false;

  const payload = `${owner}.${issuedAt}.${nonce}`;
  const expected = createHmac("sha256", signingSecret).update(payload).digest("hex");
  const givenBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return givenBuffer.length === expectedBuffer.length && timingSafeEqual(givenBuffer, expectedBuffer);
}

export type StravaConnection = {
  id: string;
  owner: StravaOwner;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string | null;
  athlete_id: number | null;
  athlete_name: string | null;
};

export async function getStravaConnection(
  owner: StravaOwner,
): Promise<StravaConnection | null> {
  const { data, error } = await supabaseAdmin
    .from("strava_connections" as any)
    .select("*")
    .eq("owner", owner)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as StravaConnection | null) ?? null;
}

export async function saveStravaConnection(
  owner: StravaOwner,
  input: {
    access_token: string;
    refresh_token: string;
    expires_at: string;
    scope: string | null;
    athlete_id: number | null;
    athlete_name: string | null;
  },
) {
  // Erstatt eksisterende tilkobling for denne eieren
  await supabaseAdmin
    .from("strava_connections" as any)
    .delete()
    .eq("owner", owner);
  const { error } = await supabaseAdmin
    .from("strava_connections" as any)
    .insert({ provider: "strava", owner, ...input });
  if (error) throw new Error(error.message);
}

export async function updateStravaTokens(
  id: string,
  patch: { access_token: string; refresh_token: string; expires_at: string },
) {
  const { error } = await supabaseAdmin
    .from("strava_connections" as any)
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteStravaConnection(owner: StravaOwner) {
  const { error } = await supabaseAdmin
    .from("strava_connections" as any)
    .delete()
    .eq("owner", owner);
  if (error) throw new Error(error.message);
}

/**
 * Returnerer en gyldig access_token for gitt eier. Refresher hvis utløpt.
 */
export async function getValidStravaAccessToken(owner: StravaOwner): Promise<{
  accessToken: string;
  athleteName: string | null;
  athleteId: number | null;
} | null> {
  const conn = await getStravaConnection(owner);
  if (!conn) return null;

  const expiresAt = new Date(conn.expires_at).getTime();
  const now = Date.now();
  if (expiresAt - now > 60_000) {
    return {
      accessToken: conn.access_token,
      athleteName: conn.athlete_name,
      athleteId: conn.athlete_id,
    };
  }

  const { clientId, clientSecret } = getStravaCredentials(owner);
  if (!clientId || !clientSecret) {
    throw new Error(`STRAVA_CLIENT_ID/SECRET mangler for ${owner}`);
  }

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava token-refresh feilet (${res.status}): ${text.slice(0, 200)}`);
  }
  const tok = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number; // unix seconds
  };
  const newExpiresAt = new Date(tok.expires_at * 1000).toISOString();
  await updateStravaTokens(conn.id, {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: newExpiresAt,
  });
  return {
    accessToken: tok.access_token,
    athleteName: conn.athlete_name,
    athleteId: conn.athlete_id,
  };
}
