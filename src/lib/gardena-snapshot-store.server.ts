import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { GardenaSnapshot } from "@/lib/gardena.server";

const TABLE = "gardena_snapshot";
const CACHE_KEY = "gardena:snapshot:v1";

export async function loadStoredGardenaSnapshot(): Promise<{ snap: GardenaSnapshot; updatedAt: string } | null> {
  try {
    const { data } = await supabaseAdmin
      .from(TABLE as any)
      .select("data, updated_at")
      .eq("cache_key", CACHE_KEY)
      .maybeSingle();
    if (!data) return null;
    return { snap: (data as any).data as GardenaSnapshot, updatedAt: (data as any).updated_at as string };
  } catch {
    return null;
  }
}

export async function saveGardenaSnapshot(snap: GardenaSnapshot): Promise<void> {
  try {
    await supabaseAdmin
      .from(TABLE as any)
      .upsert(
        { cache_key: CACHE_KEY, data: snap as any, updated_at: new Date().toISOString() } as any,
        { onConflict: "cache_key" },
      );
  } catch {
    /* best effort */
  }
}
