import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ClimatePref = {
  id: string;
  room_key: "stua" | "soverommet" | "hytta-stua";
  label: string;
  enabled: boolean;
  notify_hot: boolean;
  hot_threshold: number;
  notify_cold: boolean;
  cold_threshold: number;
  recipient: string;
  cooldown_minutes: number;
  last_notified_hot_at: string | null;
  last_notified_cold_at: string | null;
  last_value: number | null;
  last_checked_at: string | null;
};

export const listClimatePrefs = createServerFn({ method: "GET" }).handler(
  async (): Promise<ClimatePref[]> => {
    const { data, error } = await supabaseAdmin
      .from("climate_notification_prefs" as never)
      .select(
        "id, room_key, label, enabled, notify_hot, hot_threshold, notify_cold, cold_threshold, recipient, cooldown_minutes, last_notified_hot_at, last_notified_cold_at, last_value, last_checked_at",
      )
      .order("label");
    if (error) throw error;
    return (data ?? []) as unknown as ClimatePref[];
  },
);

const updateSchema = z.object({
  id: z.string().uuid(),
  enabled: z.boolean(),
  notify_hot: z.boolean(),
  hot_threshold: z.number().min(5).max(40),
  notify_cold: z.boolean(),
  cold_threshold: z.number().min(0).max(30),
  recipient: z.string().min(1).max(40),
  cooldown_minutes: z.number().int().min(5).max(1440),
});

export const updateClimatePref = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateSchema.parse(data))
  .handler(async ({ data }) => {
    const { id, ...rest } = data;
    const { error } = await supabaseAdmin
      .from("climate_notification_prefs" as never)
      .update(rest as never)
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const runClimateNotifications = createServerFn({ method: "POST" }).handler(async () => {
  const mod = await import("./climate-push.server");
  return mod.processClimateNotifications();
});
