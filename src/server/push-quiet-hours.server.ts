/**
 * "Stille timer" for push-varsler. Per mottaker (Alle, Arne, Rebekka, ...)
 * kan vi sette tidsvindu der ingen push skal sendes. Egne tider for
 * hverdag og helg (lør/søn). Tider tolkes i Europe/Oslo.
 *
 * Cachet i minnet i 30s slik at vi ikke gjør DB-oppslag per push-send.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type QuietHoursRow = {
  recipient: string;
  enabled: boolean;
  weekday_start: string; // 'HH:MM' eller 'HH:MM:SS'
  weekday_end: string;
  weekend_start: string;
  weekend_end: string;
  updated_at?: string;
};

type Cache = { ts: number; rows: Map<string, QuietHoursRow> };
const TTL_MS = 30_000;
const g = globalThis as unknown as { __quietHoursCache?: Cache };

async function loadAll(): Promise<Map<string, QuietHoursRow>> {
  const now = Date.now();
  if (g.__quietHoursCache && now - g.__quietHoursCache.ts < TTL_MS) {
    return g.__quietHoursCache.rows;
  }
  const { data } = await supabaseAdmin
    .from("push_quiet_hours" as never)
    .select("*");
  const m = new Map<string, QuietHoursRow>();
  for (const r of (data ?? []) as unknown as QuietHoursRow[]) m.set(r.recipient, r);
  g.__quietHoursCache = { ts: now, rows: m };
  return m;
}

export function invalidateQuietHoursCache() {
  g.__quietHoursCache = undefined;
}

function nowInOsloParts(): { dow: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const wk = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hh = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const mm = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { dow: map[wk] ?? 1, minutes: hh * 60 + mm };
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}

function isInWindow(nowMin: number, startMin: number, endMin: number): boolean {
  if (startMin === endMin) return false;
  if (startMin < endMin) return nowMin >= startMin && nowMin < endMin;
  // wrap over midnight
  return nowMin >= startMin || nowMin < endMin;
}

function rowMatches(row: QuietHoursRow | undefined, parts: { dow: number; minutes: number }): boolean {
  if (!row || !row.enabled) return false;
  const isWeekend = parts.dow === 0 || parts.dow === 6;
  const start = toMinutes(isWeekend ? row.weekend_start : row.weekday_start);
  const end = toMinutes(isWeekend ? row.weekend_end : row.weekday_end);
  return isInWindow(parts.minutes, start, end);
}

/**
 * Sjekker om en gitt mottaker (push_subscriptions.who) er i et stille-vindu
 * akkurat nå. Sjekker både egen rad og fallback til "Alle".
 */
export async function isWhoInQuietHours(who: string | null | undefined): Promise<boolean> {
  try {
    const rows = await loadAll();
    const parts = nowInOsloParts();
    const name = (who && who.length > 0) ? who : "Alle";
    if (rowMatches(rows.get(name), parts)) return true;
    if (name !== "Alle" && rowMatches(rows.get("Alle"), parts)) return true;
    return false;
  } catch {
    return false;
  }
}

export async function listQuietHours(): Promise<QuietHoursRow[]> {
  const rows = await loadAll();
  return Array.from(rows.values()).sort((a, b) => a.recipient.localeCompare(b.recipient, "nb"));
}

export async function upsertQuietHoursDb(row: QuietHoursRow): Promise<void> {
  await supabaseAdmin
    .from("push_quiet_hours" as never)
    .upsert({
      recipient: row.recipient,
      enabled: row.enabled,
      weekday_start: row.weekday_start,
      weekday_end: row.weekday_end,
      weekend_start: row.weekend_start,
      weekend_end: row.weekend_end,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: "recipient" } as never);
  invalidateQuietHoursCache();
}

export async function deleteQuietHoursDb(recipient: string): Promise<void> {
  await supabaseAdmin
    .from("push_quiet_hours" as never)
    .delete()
    .eq("recipient", recipient);
  invalidateQuietHoursCache();
}
