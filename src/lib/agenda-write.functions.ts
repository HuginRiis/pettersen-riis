// Server-side skrivehandlinger for agenda_messages — krever husets sesjon.
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

const __loadAuth = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/house-auth.server")> => import("@/lib/house-auth.server"))
  .client((): Promise<typeof import("@/lib/house-auth.server")> => Promise.resolve({ requireHouseAuth: async () => {}, isHouseAuthenticated: async () => false } as unknown as typeof import("@/lib/house-auth.server")));
const { requireHouseAuth } = await __loadAuth();

export const insertAgendaMessage = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        subject: z.string().min(1).max(500),
        body: z.string().max(5000).nullable().optional(),
        event_date: z.string().min(4).max(20),
        event_time: z.string().max(20).nullable().optional(),
        who: z.string().max(50),
        notify_minutes_before: z.number().int().min(0).max(10080).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    await requireHouseAuth();
    const { error } = await (supabaseAdmin.from("agenda_messages") as any).insert({
      subject: data.subject,
      body: data.body ?? null,
      event_date: data.event_date,
      event_time: data.event_time ?? null,
      who: data.who,
      notify_minutes_before: data.notify_minutes_before ?? null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

export const deleteAgendaMessage = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    await requireHouseAuth();
    const { error } = await (supabaseAdmin.from("agenda_messages") as any)
      .delete()
      .eq("id", data.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });
