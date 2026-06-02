import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PushLogEntry = {
  recipient: string;
  feature: string;
  ok: boolean;
  endpoint?: string | null;
  status_code?: number | null;
  error_message?: string | null;
  title?: string | null;
  body?: string | null;
};

/**
 * Logger hver Web Push som er forsøkt sendt. Brukes av Vakttårnet
 * til å vise hvor mange varslinger hver bruker har mottatt.
 *
 * Feilet logging skal aldri bryte selve push-flyten.
 */
export async function logPushSend(entry: PushLogEntry): Promise<void> {
  try {
    await supabaseAdmin.from("push_send_log").insert({
      recipient: entry.recipient || "Alle",
      feature: entry.feature,
      ok: entry.ok,
      endpoint: entry.endpoint ?? null,
      status_code: entry.status_code ?? null,
      error_message: entry.error_message ?? null,
      title: entry.title ?? null,
      body: entry.body ?? null,
    });
  } catch (err) {
    console.warn("[push-log] insert failed", err);
  }
}
