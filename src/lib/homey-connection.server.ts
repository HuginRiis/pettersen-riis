import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type HomeyConnection = {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string | null;
  athom_user_id: string | null;
  athom_user_name: string | null;
  homey_id?: string | null;
  homey_name?: string | null;
  homey_base_url?: string | null;
  homey_target_cached_at?: string | null;
};

export async function saveHomeyTargetCache(
  id: string,
  target: { homey_id: string; homey_name: string | null; homey_base_url: string },
) {
  const { error } = await supabaseAdmin
    .from("homey_connections")
    .update({
      homey_id: target.homey_id,
      homey_name: target.homey_name,
      homey_base_url: target.homey_base_url,
      homey_target_cached_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Nullstill lagret Homey-target (brukes når Homey byttes ut / adressen er død). */
export async function clearHomeyTargetCache(id: string) {
  const { error } = await supabaseAdmin
    .from("homey_connections")
    .update({
      homey_id: null,
      homey_name: null,
      homey_base_url: null,
      homey_target_cached_at: null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getHomeyConnection(): Promise<HomeyConnection | null> {
  const { data, error } = await supabaseAdmin
    .from("homey_connections")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as HomeyConnection | null) ?? null;
}

export async function saveHomeyConnection(input: {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string | null;
  athom_user_id: string | null;
  athom_user_name: string | null;
}) {
  // Replace any existing row — single household connection
  await supabaseAdmin.from("homey_connections").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const { error } = await supabaseAdmin.from("homey_connections").insert({
    provider: "athom",
    ...input,
  });
  if (error) throw new Error(error.message);
}

export async function updateHomeyTokens(
  id: string,
  patch: { access_token: string; refresh_token: string; expires_at: string; scope?: string | null },
) {
  const { error } = await supabaseAdmin
    .from("homey_connections")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteHomeyConnection() {
  const { error } = await supabaseAdmin
    .from("homey_connections")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw new Error(error.message);
}
