import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const listLoginAttempts = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ limit: z.number().min(1).max(200).optional() }).parse(data ?? {}))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("visitor_login_attempts" as never)
      .select("id, attempted_at, success, who, ip, city, country, os, browser, device_type")
      .order("attempted_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw new Error(error.message);
    return { attempts: (rows ?? []) as Array<{
      id: string;
      attempted_at: string;
      success: boolean;
      who: string | null;
      ip: string | null;
      city: string | null;
      country: string | null;
      os: string | null;
      browser: string | null;
      device_type: string | null;
    }> };
  });
