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

export type ChangelogCategory = "code" | "app";

export type ChangelogEntry = {
  id: string;
  changed_at: string;
  title: string;
  description: string | null;
  category: ChangelogCategory;
};

export const listChangelog = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("changelog_entries")
    .select("id,changed_at,title,description,category")
    .order("changed_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  return (data ?? []) as ChangelogEntry[];
});

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  changed_at: z.string().optional(),
  category: z.enum(["code", "app"]).optional(),
});

export const upsertChangelog = createServerFn({ method: "POST" })
  .inputValidator((d) => upsertSchema.parse(d))
  .handler(async ({ data }) => {
    const row: {
      id?: string;
      title: string;
      description: string | null;
      changed_at?: string;
      category?: ChangelogCategory;
    } = {
      title: data.title,
      description: data.description ?? null,
    };
    if (data.changed_at) row.changed_at = data.changed_at;
    if (data.id) row.id = data.id;
    if (data.category) row.category = data.category;
    const { data: saved, error } = await supabaseAdmin
      .from("changelog_entries")
      .upsert(row)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return saved as ChangelogEntry;
  });

export const deleteChangelog = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("changelog_entries")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
