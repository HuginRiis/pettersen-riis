// Server-side skrivehandlinger for push_subscriptions — krever husets sesjon.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const WHO_VALUES = [
  "Alle",
  "Arne & Rebekka",
  "Arne",
  "Rebekka",
  "Marita",
  "Nora",
  "Celine",
  "Mira",
] as const;

async function admin() {
  const mod = await import("@/integrations/supabase/client.server");
  return mod.supabaseAdmin;
}

async function requireAuth() {
  const { requireHouseAuth } = await import("@/lib/house-auth.server");
  await requireHouseAuth();
}

export const upsertPushSubscription = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        endpoint: z.string().url().max(2000),
        p256dh: z.string().min(1).max(500),
        auth: z.string().min(1).max(500),
        who: z.enum(WHO_VALUES),
        user_agent: z.string().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    await requireAuth();
    const sb = await admin();
    const { error } = await (sb.from("push_subscriptions") as any).upsert(
      {
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        who: data.who,
        user_agent: data.user_agent ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

export const updatePushSubscriptionWho = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ endpoint: z.string().url().max(2000), who: z.enum(WHO_VALUES) }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    await requireAuth();
    const sb = await admin();
    const { error } = await (sb.from("push_subscriptions") as any)
      .update({ who: data.who, last_used_at: new Date().toISOString() })
      .eq("endpoint", data.endpoint);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

export const deletePushSubscription = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ endpoint: z.string().url().max(2000) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    await requireAuth();
    const sb = await admin();
    const { error } = await (sb.from("push_subscriptions") as any)
      .delete()
      .eq("endpoint", data.endpoint);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });
