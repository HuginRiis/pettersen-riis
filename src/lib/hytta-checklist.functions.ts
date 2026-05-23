import { createServerFn } from "@tanstack/react-start";
import {
  addHyttaChecklistRow,
  deleteHyttaChecklistRow,
  listHyttaChecklistRows,
  scheduleHyttaChecklistRows,
  setHyttaChecklistChecked,
} from "./hytta-checklist.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECIPIENTS = new Set(["Alle", "Arne & Rebekka", "Arne", "Rebekka"]);

function parseId(id: unknown): string {
  if (typeof id !== "string" || !UUID_RE.test(id)) throw new Error("Ugyldig punkt.");
  return id;
}

function parseRecipient(value: unknown): string {
  const recipient = typeof value === "string" ? value.trim() : "Alle";
  return RECIPIENTS.has(recipient) ? recipient : "Alle";
}

export const listHyttaChecklist = createServerFn({ method: "GET" }).handler(async () => {
  const items = await listHyttaChecklistRows();
  return { items };
});

export const addHyttaChecklistItem = createServerFn({ method: "POST" })
  .inputValidator((input: { label: string; added_by?: string; sort_order?: number }) => {
    const label = String(input?.label ?? "").trim().slice(0, 200);
    if (!label) throw new Error("Skriv inn et punkt først.");
    const added_by = String(input?.added_by ?? "Alle").trim().slice(0, 40) || "Alle";
    const sort_order = Number.isFinite(input?.sort_order) ? Math.max(0, Math.round(input.sort_order!)) : 0;
    return { label, added_by, sort_order };
  })
  .handler(async ({ data }) => {
    const item = await addHyttaChecklistRow(data);
    return { item };
  });

export const toggleHyttaChecklistItem = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; checked: boolean }) => ({
    id: parseId(input?.id),
    checked: input?.checked === true,
  }))
  .handler(async ({ data }) => {
    await setHyttaChecklistChecked(data.id, data.checked);
    return { ok: true };
  });

export const deleteHyttaChecklistItem = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => ({ id: parseId(input?.id) }))
  .handler(async ({ data }) => {
    await deleteHyttaChecklistRow(data.id);
    return { ok: true };
  });

export const scheduleHyttaChecklistReminder = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      ids: string[];
      notify_at: string | null;
      notify_who?: string;
      repeat_interval_days?: number | null;
    }) => {
      const ids = Array.isArray(input?.ids) ? input.ids.map(parseId).slice(0, 200) : [];
      if (ids.length === 0) throw new Error("Ingen punkter valgt.");
      const notify_at = input.notify_at === null ? null : String(input.notify_at ?? "");
      if (notify_at !== null && Number.isNaN(new Date(notify_at).getTime())) throw new Error("Ugyldig tidspunkt.");
      const repeat = input.repeat_interval_days == null ? null : Math.max(1, Math.min(365, Math.round(input.repeat_interval_days)));
      return {
        ids,
        notify_at,
        notify_who: parseRecipient(input.notify_who),
        repeat_interval_days: repeat,
      };
    },
  )
  .handler(async ({ data }) => {
    await scheduleHyttaChecklistRows(data);
    return { ok: true };
  });