import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Netatmo roterer refresh_token ved hver bruk. Hvis vi bare holder den i minnet,
 * mister vi den ved kald start av worker — og initial-tokenen i env er da ugyldig
 * ("Invalid access token"). Vi persisterer derfor siste refresh_token i
 * notification_settings (vår enkle KV-tabell).
 */

export async function loadStoredRefreshToken(key: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from("notification_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    const v = (data as any)?.value;
    if (v && typeof v === "object" && typeof v.refresh_token === "string") {
      return v.refresh_token as string;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveStoredRefreshToken(key: string, refreshToken: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("notification_settings")
      .upsert(
        { key, value: { refresh_token: refreshToken, updated_at: new Date().toISOString() } as any },
        { onConflict: "key" },
      );
  } catch {
    /* best effort */
  }
}
