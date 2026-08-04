import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Delte Linketur-data (hytter, personer, bilder) lagret i databasen. */
export async function readLinketurState(key: string): Promise<unknown> {
  const { data, error } = await supabaseAdmin
    .from("linketur_state")
    .select("data")
    .eq("key", key)
    .maybeSingle();

  if (error) throw error;
  return (data as { data?: unknown } | null)?.data ?? null;
}

export async function writeLinketurState(key: string, value: unknown): Promise<void> {
  const { error } = await supabaseAdmin
    .from("linketur_state")
    .upsert({ key, data: value as never, updated_at: new Date().toISOString() }, { onConflict: "key" });

  if (error) throw error;
}
