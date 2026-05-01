import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ChangelogEntry = {
  id: string;
  changed_at: string;
  title: string;
  description: string | null;
};

export const listChangelog = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("changelog_entries")
    .select("id,changed_at,title,description")
    .order("changed_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as ChangelogEntry[];
});

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  changed_at: z.string().optional(),
});

export const upsertChangelog = createServerFn({ method: "POST" })
  .inputValidator((d) => upsertSchema.parse(d))
  .handler(async ({ data }) => {
    const row: {
      id?: string;
      title: string;
      description: string | null;
      changed_at?: string;
    } = {
      title: data.title,
      description: data.description ?? null,
    };
    if (data.changed_at) row.changed_at = data.changed_at;
    if (data.id) row.id = data.id;
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
