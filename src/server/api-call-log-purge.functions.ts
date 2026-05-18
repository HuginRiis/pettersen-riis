// Sletter gamle rader fra api_call_log basert på alder i dager.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
