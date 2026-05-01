import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  listLightAndMotionZones,
  sendLightIdleTest,
} from "./light-idle-push.server";

export type LightIdlePref = {
  id: string;
  homey_zone_id: string;
  zone_name: string;
  recipient: string;
  lights_on_minutes: number;
  no_motion_minutes: number;
  enabled: boolean;
  cooldown_minutes: number;
  last_notified_at: string | null;
};

export const listLightIdlePrefs = createServerFn({ method: "GET" }).handler(
  async (): Promise<LightIdlePref[]> => {
    const { data, error } = await supabaseAdmin
      .from("light_idle_notification_prefs" as never)
      .select("*")
      .order("zone_name");
    if (error) throw error;
    return (data ?? []) as unknown as LightIdlePref[];
  },
);

export const listLightIdleZones = createServerFn({ method: "GET" }).handler(
  async () => listLightAndMotionZones(),
);

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  homey_zone_id: z.string().min(1),
  zone_name: z.string().min(1).max(120),
  recipient: z.string().min(1).max(40),
  lights_on_minutes: z.number().int().min(1).max(1440),
  no_motion_minutes: z.number().int().min(1).max(1440),
  enabled: z.boolean(),
  cooldown_minutes: z.number().int().min(5).max(1440),
});

export const upsertLightIdlePref = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => upsertSchema.parse(data))
  .handler(async ({ data }) => {
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("light_idle_notification_prefs" as never)
        .update({
          homey_zone_id: data.homey_zone_id,
          zone_name: data.zone_name,
          recipient: data.recipient,
          lights_on_minutes: data.lights_on_minutes,
          no_motion_minutes: data.no_motion_minutes,
          enabled: data.enabled,
          cooldown_minutes: data.cooldown_minutes,
        } as never)
        .eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("light_idle_notification_prefs" as never)
      .insert({
        homey_zone_id: data.homey_zone_id,
        zone_name: data.zone_name,
        recipient: data.recipient,
        lights_on_minutes: data.lights_on_minutes,
        no_motion_minutes: data.no_motion_minutes,
        enabled: data.enabled,
        cooldown_minutes: data.cooldown_minutes,
      } as never)
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: (row as { id: string }).id };
  });

export const deleteLightIdlePref = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("light_idle_notification_prefs" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const testLightIdlePref = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => sendLightIdleTest(data.id));
