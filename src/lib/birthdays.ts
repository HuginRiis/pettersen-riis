import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
const __load_birthdays_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/server/birthdays.server")> => import("@/server/birthdays.server"))
  .client((): Promise<typeof import("@/server/birthdays.server")> => Promise.resolve({} as unknown as typeof import("@/server/birthdays.server")));

export async function processBirthdayNotifications() {
  const mod = await __load_birthdays_server();
  return mod.processBirthdayNotifications();
}

export const sendBirthdayTestPush = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => {
    if (typeof input?.id !== "string" || input.id.length < 8 || input.id.length > 64) {
      throw new Error("Ugyldig bursdag-ID.");
    }
    return { id: input.id };
  })
  .handler(async ({ data }) => {
    const mod = await __load_birthdays_server();
    // Trigger on-demand: bruk samme prosess men send uavhengig av tid.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("birthdays")
      .select("name, title, words, birth_date, notify_recipients")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Fant ikke bursdagen.");
    return mod.sendBirthdayPushNow(data.id, row as any);
  });
