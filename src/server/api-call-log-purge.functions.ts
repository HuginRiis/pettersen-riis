// Sletter gamle rader fra api_call_log basert på alder i dager.
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

export const purgeApiCallLog = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ olderThanDays: z.number().min(1).max(365) }).parse(data),
  )
  .handler(async ({ data }): Promise<{ deleted: number; cutoff: string }> => {
    const cutoff = new Date(
      Date.now() - data.olderThanDays * 24 * 3600 * 1000,
    ).toISOString();

    const { count, error } = await (supabaseAdmin.from("api_call_log") as any)
      .delete({ count: "exact" })
      .lt("called_at", cutoff);

    if (error) throw new Error(error.message);
    return { deleted: count ?? 0, cutoff };
  });
