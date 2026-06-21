import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Netatmo roterer refresh_token ved hver bruk. Hvis vi bare holder den i
 * minnet, mister vi den ved kald start av worker — og initial-tokenen i env
 * er da ugyldig. I tillegg har Netatmo en aggressiv rate-limit på
 * /oauth2/token (error code 29 "Access temporarily restricted"), så vi
 * persisterer hele token-objektet (access + refresh + utløp) slik at
 * cold-start workers kan gjenbruke en gyldig access_token uten å refreshe.
 *
 * Vi lagrer i notification_settings (vår enkle KV-tabell).
 */

export type StoredToken = {
  access_token?: string;
  refresh_token: string;
  expires_at?: number; // unix ms
  updated_at: string;
};

export async function loadStoredRefreshToken(key: string): Promise<string | null> {
  const tok = await loadStoredToken(key);
  return tok?.refresh_token ?? null;
}

export async function loadStoredToken(key: string): Promise<StoredToken | null> {
  try {
    const { data } = await supabaseAdmin
      .from("notification_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    const v = (data as any)?.value;
    if (v && typeof v === "object" && typeof v.refresh_token === "string") {
      return {
        access_token: typeof v.access_token === "string" ? v.access_token : undefined,
        refresh_token: v.refresh_token as string,
        expires_at: typeof v.expires_at === "number" ? v.expires_at : undefined,
        updated_at: typeof v.updated_at === "string" ? v.updated_at : new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveStoredRefreshToken(key: string, refreshToken: string): Promise<void> {
  // Bevar eventuelt eksisterende access_token / expires_at om vi bare
  // oppdaterer refresh-tokenen.
  const existing = await loadStoredToken(key);
  await saveStoredToken(key, {
    refresh_token: refreshToken,
    access_token: existing?.access_token,
    expires_at: existing?.expires_at,
    updated_at: new Date().toISOString(),
  });
}

export async function saveStoredToken(
  key: string,
  token: Omit<StoredToken, "updated_at"> & { updated_at?: string },
): Promise<void> {
  try {
    await supabaseAdmin
      .from("notification_settings")
      .upsert(
        {
          key,
          value: {
            access_token: token.access_token ?? null,
            refresh_token: token.refresh_token,
            expires_at: token.expires_at ?? null,
            updated_at: token.updated_at ?? new Date().toISOString(),
          } as any,
        },
        { onConflict: "key" },
      );
  } catch {
    /* best effort */
  }
}
