import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type HyttaChecklistRow = {
  id: string;
  label: string;
  added_by: string;
  checked: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  notify_at: string | null;
  notified_at: string | null;
  notify_who: string;
  repeat_interval_days: number | null;
};

const CHECKLIST_COLUMNS =
  "id, label, added_by, checked, sort_order, created_at, updated_at, notify_at, notified_at, notify_who, repeat_interval_days";

export async function listHyttaChecklistRows(): Promise<HyttaChecklistRow[]> {
  const { data, error } = await supabaseAdmin
    .from("hytta_checklist")
    .select(CHECKLIST_COLUMNS)
    .order("checked", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as HyttaChecklistRow[];
}

export async function addHyttaChecklistRow(input: {
  label: string;
  added_by: string;
  sort_order: number;
}): Promise<HyttaChecklistRow> {
  const { data, error } = await supabaseAdmin
    .from("hytta_checklist")
    .insert(input)
    .select(CHECKLIST_COLUMNS)
    .single();

  if (error) throw error;
  return data as HyttaChecklistRow;
}

export async function setHyttaChecklistChecked(id: string, checked: boolean): Promise<void> {
  const { error } = await supabaseAdmin
    .from("hytta_checklist")
    .update({ checked })
    .eq("id", id);

  if (error) throw error;
}

export async function deleteHyttaChecklistRow(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("hytta_checklist").delete().eq("id", id);
  if (error) throw error;
}

export async function scheduleHyttaChecklistRows(input: {
  ids: string[];
  notify_at: string | null;
  notify_who: string;
  repeat_interval_days: number | null;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from("hytta_checklist")
    .update({
      notify_at: input.notify_at,
      notified_at: null,
      notify_who: input.notify_who,
      repeat_interval_days: input.repeat_interval_days,
    })
    .in("id", input.ids);

  if (error) throw error;
}