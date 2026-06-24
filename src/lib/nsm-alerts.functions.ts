import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

export type NsmAlert = {
  id: string;
  external_id: string;
  title: string;
  summary: string | null;
  url: string;
  published_at: string | null;
  fetched_at: string;
};

export const getLatestNsmAlerts = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("nsm_alerts" as never)
    .select("id, external_id, title, summary, url, published_at, fetched_at")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as unknown as NsmAlert[];
});

export const triggerNsmPoll = createServerFn({ method: "POST" }).handler(async () => {
  const { pollAndStoreNsm, processNsmNotifications } = await import("./nsm-alerts.server");
  const stored = await pollAndStoreNsm();
  const pushed = await processNsmNotifications();
  return { stored, pushed };
});

export const sendNsmTest = createServerFn({ method: "POST" })
  .inputValidator((data: { recipient: string }) => data)
  .handler(async ({ data }) => {
    const { sendNsmTestPush } = await import("./nsm-alerts.server");
    return sendNsmTestPush(data.recipient || "Alle");
  });

// Klient-side helpere for prefs (RLS)
export async function listNsmPrefs() {
  const { data, error } = await supabase
    .from("nsm_notification_prefs" as never)
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; recipient: string; enabled: boolean }>;
}

export async function upsertNsmPref(recipient: string, enabled: boolean) {
  const { error } = await supabase
    .from("nsm_notification_prefs" as never)
    .upsert({ recipient, enabled, updated_at: new Date().toISOString() } as never, { onConflict: "recipient" });
  if (error) throw error;
}

export async function deleteNsmPref(id: string) {
  const { error } = await supabase.from("nsm_notification_prefs" as never).delete().eq("id", id);
  if (error) throw error;
}
