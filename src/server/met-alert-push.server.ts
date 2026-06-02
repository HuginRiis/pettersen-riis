/**
 * Sender push-varsler ved nye Met.no-farevarsler basert på brukerregler:
 * mottaker, fylker, varseltyper, minste farenivå (Yellow/Orange/Red).
 *
 * Maks ett push per (regel, varsel-id) — bruker `notified_alert_ids` på
 * regelen for å hindre dobbelt-varsling. Kjøres fra agenda-push hooken.
 */
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logPushSend } from "./push-log.server";
import { buildSubscriptionWhoOr } from "./push-recipients";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY!;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:agenda@riis.cc";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) throw new Error("VAPID keys missing");
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  configured = true;
}

const COLOR_RANK: Record<string, number> = { Yellow: 1, Orange: 2, Red: 3 };

type Pref = {
  id: string;
  recipient: string;
  counties: string[];
  event_types: string[];
  min_color: string;
  colors: string[] | null;
  enabled: boolean;
  notified_alert_ids: string[];
};

function colorEmoji(c: string | null): string {
  if (c === "Red") return "🔴";
  if (c === "Orange") return "🟠";
  if (c === "Yellow") return "🟡";
  return "⚠️";
}

async function sendOne(
  sub: { endpoint: string; p256dh: string; auth: string; who?: string | null },
  payload: string,
  ctx: { recipient: string; title: string },
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    );
    void logPushSend({
      feature: "met-alert",
      recipient: ctx.recipient || sub.who || "Alle",
      ok: true,
      endpoint: sub.endpoint,
      title: ctx.title,
    });
    return true;
  } catch (err) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 404 || e.statusCode === 410) {
      await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
    void logPushSend({
      feature: "met-alert",
      recipient: ctx.recipient,
      ok: false,
      endpoint: sub.endpoint,
      status_code: e.statusCode ?? null,
      error_message: e.message ?? null,
      title: ctx.title,
    });
    return false;
  }
}

export async function processMetAlertNotifications(): Promise<{
  checked: number;
  sent: number;
  errors: number;
  skipped: number;
}> {
  ensureConfigured();

  const { data: prefsRaw, error: pErr } = await supabaseAdmin
    .from("met_alert_notification_prefs" as never)
    .select("*")
    .eq("enabled", true);
  if (pErr) throw pErr;
  const prefs = (prefsRaw ?? []) as unknown as Pref[];
  if (prefs.length === 0) return { checked: 0, sent: 0, errors: 0, skipped: 0 };

  const { fetchTelemarkAlertsSnapshot } = await import("./met-alerts.server");
  const r = await fetchTelemarkAlertsSnapshot();
  const alerts = r.alerts ?? [];

  let checked = 0;
  let sent = 0;
  let errors = 0;
  let skipped = 0;

  for (const pref of prefs) {
    const allowedColors = (pref.colors && pref.colors.length > 0)
      ? new Set(pref.colors)
      : (() => {
          const minRank = COLOR_RANK[pref.min_color] ?? 1;
          return new Set(Object.entries(COLOR_RANK).filter(([, r]) => r >= minRank).map(([k]) => k));
        })();
    const already = new Set(pref.notified_alert_ids ?? []);
    const matching = alerts.filter((a) => {
      const c = a.riskMatrixColor ?? "";
      if (!allowedColors.has(c)) return false;
      if (pref.counties.length > 0) {
        const overlap = (a.countyNames ?? []).some((n) => pref.counties.includes(n));
        if (!overlap) return false;
      }
      if (pref.event_types.length > 0) {
        const ev = a.event ?? "";
        if (!pref.event_types.includes(ev)) return false;
      }
      return !already.has(a.id);
    });

    checked += matching.length;
    if (matching.length === 0) continue;

    const targetWho = pref.recipient || "Alle";
    let subQuery = supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
    {
      const orFilter = buildSubscriptionWhoOr(targetWho);
      if (orFilter) subQuery = subQuery.or(orFilter);
    }
    const { data: subs, error: sErr } = await subQuery;
    if (sErr) {
      errors++;
      continue;
    }

    for (const a of matching) {
      const title = `${colorEmoji(a.riskMatrixColor)} ${a.eventAwarenessName ?? a.event}`;
      const where = a.area ?? (a.countyNames ?? []).join(", ") ?? "";
      const body = `${where}${where ? " — " : ""}${a.description ?? ""}`.slice(0, 240);
      const payload = JSON.stringify({
        title,
        body,
        tag: `met-alert-${a.id}`,
        url: "/varsler",
      });
      for (const sub of subs ?? []) {
        const ok = await sendOne(
          {
            endpoint: sub.endpoint as string,
            p256dh: sub.p256dh as string,
            auth: sub.auth as string,
            who: (sub as any).who ?? null,
          },
          payload,
          { recipient: targetWho, title },
        );
        if (ok) sent++;
        else errors++;
      }
      already.add(a.id);
    }

    // Behold kun IDer som fortsatt finnes i aktive varsler + de nye vi nettopp varslet om
    const liveIds = new Set(alerts.map((a) => a.id));
    const trimmed = Array.from(already).filter((id) => liveIds.has(id));
    await supabaseAdmin
      .from("met_alert_notification_prefs" as never)
      .update({ notified_alert_ids: trimmed } as never)
      .eq("id", pref.id);
  }

  return { checked, sent, errors, skipped };
}

export async function sendMetAlertTestNotification(prefId: string): Promise<{
  sent: number;
  errors: number;
  recipient: string;
}> {
  ensureConfigured();
  const { data, error } = await supabaseAdmin
    .from("met_alert_notification_prefs" as never)
    .select("*")
    .eq("id", prefId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Fant ikke regel");
  const pref = data as unknown as Pref;

  const targetWho = pref.recipient || "Alle";
  let subQuery = supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
  {
    const orFilter = buildSubscriptionWhoOr(targetWho);
    if (orFilter) subQuery = subQuery.or(orFilter);
  }
  const { data: subs } = await subQuery;
  const payload = JSON.stringify({
    title: "🧪 TEST: Farevarsel-regel aktiv",
    body: `Mottaker ${targetWho}. Farger: ${(pref.colors && pref.colors.length ? pref.colors : [pref.min_color]).join(", ")}. Fylker: ${pref.counties.join(", ") || "alle"}. Typer: ${pref.event_types.join(", ") || "alle"}.`,
    tag: `met-alert-test-${prefId}-${Date.now()}`,
    url: "/varsler",
  });
  let sent = 0;
  let errors = 0;
  for (const sub of subs ?? []) {
    const ok = await sendOne(
      {
        endpoint: sub.endpoint as string,
        p256dh: sub.p256dh as string,
        auth: sub.auth as string,
        who: (sub as any).who ?? null,
      },
      payload,
      { recipient: targetWho, title: "TEST farevarsel" },
    );
    if (ok) sent++;
    else errors++;
  }
  return { sent, errors, recipient: targetWho };
}
