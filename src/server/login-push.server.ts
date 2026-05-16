/**
 * Push-varsler ved innloggingsforsøk (vellykket / feilet).
 * Reglene ligger i `login_notification_prefs`. Hver regel har egen
 * mottaker og kan skrus av/på samt velge om vellykket og/eller feilet
 * skal varsles.
 *
 * Kalles fra `logLoginAttempt()` etter at forsøket er logget. Skal
 * ALDRI bryte selve login-flyten.
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

type Pref = {
  id: string;
  recipient: string;
  enabled: boolean;
  notify_on_success: boolean;
  notify_on_failure: boolean;
};

async function fetchSubs(recipient: string) {
  const orFilter = buildSubscriptionWhoOr(recipient);
  let q = supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
  if (orFilter) q = q.or(orFilter);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

async function sendOne(
  sub: { endpoint: string; p256dh: string; auth: string; who?: string | null },
  payload: string,
  ctx: { recipient: string; title: string; body: string },
) {
  try {
    ensureConfigured();
    if (await isWhoInQuietHours(sub.who ?? null)) return;
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    );
    void logPushSend({ feature: "login", recipient: ctx.recipient || sub.who || "Alle", ok: true, endpoint: sub.endpoint, title: ctx.title, body: ctx.body });
    return true;
  } catch (err) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 404 || e.statusCode === 410) {
      await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
    void logPushSend({ feature: "login", recipient: ctx.recipient, ok: false, endpoint: sub.endpoint, status_code: e.statusCode ?? null, error_message: e.message ?? null, title: ctx.title, body: ctx.body });
    return false;
  }
}

export type LoginNotifyMeta = {
  success: boolean;
  who?: string | null;
  ip?: string | null;
  city?: string | null;
  country?: string | null;
  os?: string | null;
  browser?: string | null;
  deviceType?: string | null;
};

export async function notifyLoginAttempt(meta: LoginNotifyMeta): Promise<void> {
  try {
    const { data, error } = await supabaseAdmin
      .from("login_notification_prefs" as never)
      .select("id, recipient, enabled, notify_on_success, notify_on_failure");
    if (error) return;
    const prefs = (data ?? []) as unknown as Pref[];
    if (prefs.length === 0) return;

    const whoLabel = (meta.who && meta.who.trim()) || "Ukjent";
    const locParts = [meta.city, meta.country].filter((x): x is string => !!x && x.length > 0);
    const loc = locParts.length > 0 ? locParts.join(", ") : (meta.ip || "ukjent IP");
    const dev = [meta.os, meta.browser, meta.deviceType].filter((x): x is string => !!x && x.length > 0).join(" · ");

    const title = meta.success
      ? `🔓 ${whoLabel} logget inn`
      : `⛔ Feilet innlogging${meta.who ? ` (${whoLabel})` : ""}`;
    const body = `${loc}${dev ? ` — ${dev}` : ""}`;

    for (const pref of prefs) {
      if (!pref.enabled) continue;
      if (meta.success && !pref.notify_on_success) continue;
      if (!meta.success && !pref.notify_on_failure) continue;
      const subs = await fetchSubs(pref.recipient);
      if (subs.length === 0) continue;
      const payload = JSON.stringify({
        title: `[Vakttårn] ${title}`,
        body,
        tag: `login-${pref.id}-${Date.now()}`,
        url: "/vakttarnet",
      });
      for (const s of subs) {
        await sendOne(s, payload, { recipient: pref.recipient, title, body });
      }
    }
  } catch (err) {
    console.warn("[login-push] notify failed", err);
  }
}

export async function sendLoginTestNotification(prefId: string): Promise<{ sent: number; errors: number }> {
  const { data, error } = await supabaseAdmin
    .from("login_notification_prefs" as never)
    .select("id, recipient, enabled, notify_on_success, notify_on_failure")
    .eq("id", prefId)
    .maybeSingle();
  if (error || !data) throw new Error("Fant ikke regel");
  const pref = data as unknown as Pref;
  const subs = await fetchSubs(pref.recipient);
  const title = "🔓 Test — vellykket innlogging";
  const body = "Dette er en test fra innstillinger.";
  const payload = JSON.stringify({
    title: `[Vakttårn] ${title}`,
    body,
    tag: `login-test-${pref.id}-${Date.now()}`,
    url: "/vakttarnet",
  });
  let sent = 0, errors = 0;
  for (const s of subs) {
    const ok = await sendOne(s, payload, { recipient: pref.recipient, title, body });
    if (ok) sent++; else errors++;
  }
  return { sent, errors };
}
