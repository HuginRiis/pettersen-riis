import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type StravaConnection = {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string | null;
  athlete_id: number | null;
  athlete_name: string | null;
};

export async function getStravaConnection(): Promise<StravaConnection | null> {
  const { data, error } = await supabaseAdmin
    .from("strava_connections" as any)
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as StravaConnection | null) ?? null;
}

export async function saveStravaConnection(input: {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string | null;
  athlete_id: number | null;
  athlete_name: string | null;
}) {
  await supabaseAdmin
    .from("strava_connections" as any)
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  const { error } = await supabaseAdmin
    .from("strava_connections" as any)
    .insert({ provider: "strava", ...input });
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

export async function deleteStravaConnection() {
  const { error } = await supabaseAdmin
    .from("strava_connections" as any)
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw new Error(error.message);
}

/**
 * Returnerer en gyldig access_token. Refresher hvis utløpt.
 */
export async function getValidStravaAccessToken(): Promise<{
  accessToken: string;
  athleteName: string | null;
  athleteId: number | null;
} | null> {
  const conn = await getStravaConnection();
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

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("STRAVA_CLIENT_ID/SECRET mangler");
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
