import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import { z } from "zod";
const __loadAdmin = createIsomorphicFn()
  .server((): Promise<typeof import("@/integrations/supabase/client.server")> =>
    import("@/integrations/supabase/client.server"),
  )
  .client(
    (): Promise<typeof import("@/integrations/supabase/client.server")> =>
      Promise.resolve({ supabaseAdmin: null } as unknown as typeof import("@/integrations/supabase/client.server")),
  );
const { supabaseAdmin } = await __loadAdmin();
const __load_light_idle_push_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/server/light-idle-push.server")> => import("@/server/light-idle-push.server"))
  .client((): Promise<typeof import("@/server/light-idle-push.server")> => Promise.resolve({} as unknown as typeof import("@/server/light-idle-push.server")));
const { listLightAndMotionZones, sendLightIdleTest, getLightIdleZoneStatuses } = await __load_light_idle_push_server();
import type { LightIdleZoneStatusRow } from "@/server/light-idle-push.server";
export type LightIdlePref = {
  id: string;
  scope: "zone" | "global";
  homey_zone_id: string | null;
  zone_name: string | null;
  recipient: string;
  lights_on_minutes: number | null;
  no_motion_minutes: number;
  enabled: boolean;
  cooldown_minutes: number;
  last_notified_at: string | null;
};

export type { LightIdleZoneStatusRow };

export const listLightIdlePrefs = createServerFn({ method: "GET" }).handler(
  async (): Promise<LightIdlePref[]> => {
    const { data, error } = await supabaseAdmin
      .from("light_idle_notification_prefs" as never)
      .select("*")
      .order("scope")
      .order("zone_name");
    if (error) throw error;
    return (data ?? []) as unknown as LightIdlePref[];
  },
);

export const listLightIdleZones = createServerFn({ method: "GET" }).handler(
  async () => listLightAndMotionZones(),
);

export const getLightIdleStatuses = createServerFn({ method: "GET" }).handler(
  async (): Promise<LightIdleZoneStatusRow[]> => getLightIdleZoneStatuses(),
);

const upsertSchema = z
  .object({
    id: z.string().uuid().optional(),
    scope: z.enum(["zone", "global"]).default("zone"),
    homey_zone_id: z.string().min(1).nullable().optional(),
    zone_name: z.string().min(1).max(120).nullable().optional(),
    recipient: z.string().min(1).max(40),
    lights_on_minutes: z.number().int().min(1).max(1440).nullable().optional(),
    no_motion_minutes: z.number().int().min(1).max(1440),
    enabled: z.boolean(),
    cooldown_minutes: z.number().int().min(5).max(1440),
  })
  .refine(
    (d) => d.scope !== "zone" || (!!d.homey_zone_id && !!d.zone_name && !!d.lights_on_minutes),
    { message: "Per-rom-regel krever rom og 'lys på'-minutter" },
  );

export const upsertLightIdlePref = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => upsertSchema.parse(data))
  .handler(async ({ data }) => {
    const row = {
      scope: data.scope,
      homey_zone_id: data.scope === "global" ? null : data.homey_zone_id ?? null,
      zone_name: data.scope === "global" ? "Alle rom (innendørs)" : data.zone_name ?? null,
      recipient: data.recipient,
      lights_on_minutes: data.scope === "global" ? null : data.lights_on_minutes ?? null,
      no_motion_minutes: data.no_motion_minutes,
      enabled: data.enabled,
      cooldown_minutes: data.cooldown_minutes,
    };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("light_idle_notification_prefs" as never)
        .update(row as never)
        .eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("light_idle_notification_prefs" as never)
      .insert(row as never)
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: (ins as { id: string }).id };
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
