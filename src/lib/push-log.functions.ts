import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
const __loadAdmin = createIsomorphicFn()
  .server((): Promise<typeof import("@/integrations/supabase/client.server")> =>
    import("@/integrations/supabase/client.server"),
  )
  .client(
    (): Promise<typeof import("@/integrations/supabase/client.server")> =>
      Promise.resolve({ supabaseAdmin: null } as unknown as typeof import("@/integrations/supabase/client.server")),
  );
const { supabaseAdmin } = await __loadAdmin();

export type PushCountsRow = {
  recipient: string;
  today: number;
  week: number;
  month: number;
  total: number;
};

export const getPushCounts = createServerFn({ method: "GET" }).handler(
  async (): Promise<PushCountsRow[]> => {
    const now = new Date();
    const startOfTodayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

    const { data, error } = await supabaseAdmin
      .from("push_send_log")
      .select("recipient, sent_at, ok")
      .eq("ok", true)
      .order("sent_at", { ascending: false })
      .limit(50000);
    if (error) throw error;

    const map = new Map<string, PushCountsRow>();
    for (const r of (data ?? []) as Array<{ recipient: string; sent_at: string; ok: boolean }>) {
      const recipient = r.recipient || "Alle";
      const sent = new Date(r.sent_at);
      let row = map.get(recipient);
      if (!row) {
        row = { recipient, today: 0, week: 0, month: 0, total: 0 };
        map.set(recipient, row);
      }
      row.total += 1;
      if (sent >= monthAgo) row.month += 1;
      if (sent >= weekAgo) row.week += 1;
      if (sent >= startOfTodayUtc) row.today += 1;
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  },
);
