/**
 * Push-varsler for treg sidelasting og dårlig ytelse.
 *
 * Konfigurasjon ligger i notification_settings under nøkkel `slow_page_load`:
 * {
 *   enabled: boolean,
 *   recipient: string,           // "Alle" | "Arne" | "Rebekka" | "Arne & Rebekka" | ...
 *   default_ms: number,          // standard terskel (ms)
 *   cooldown_min: number,        // minst antall minutter mellom push per rute
 *   window_min: number,          // tilbakeblikk-vindu i minutter
 *   min_samples: number,         // minst antall målinger i vinduet før varsling
 *   only_mobile: boolean,        // hvis true varsles kun på mobile målinger
 *   routes: Array<{ route: string; ms: number }>,
 *   last_notified: Record<string, string>,
 *   // ekstra ytelses-varsler (samme boks):
 *   slow_avg_enabled: boolean,    // varsle om gjennomsnittlig laste-tid på alle ruter er for høy
 *   slow_avg_ms: number,
 * }
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

export type SlowPageRouteRule = { route: string; ms: number };

export type SlowPageConfig = {
  enabled: boolean;
  recipient: string;
  default_ms: number;
  cooldown_min: number;
  window_min: number;
  min_samples: number;
  only_mobile: boolean;
  routes: SlowPageRouteRule[];
  last_notified: Record<string, string>;
  slow_avg_enabled: boolean;
  slow_avg_ms: number;
  /** Egen mottaker for "Lav generell ytelse" — fallback til `recipient` hvis tom. */
  slow_avg_recipient: string;
};

const DEFAULTS: SlowPageConfig = {
  enabled: false,
  recipient: "Alle",
  default_ms: 4000,
  cooldown_min: 120,
  window_min: 60,
  min_samples: 3,
  only_mobile: true,
  routes: [],
  last_notified: {},
  slow_avg_enabled: false,
  slow_avg_ms: 3000,
  slow_avg_recipient: "",
};

export async function loadSlowPageConfig(): Promise<SlowPageConfig> {
  const { data } = await supabaseAdmin
    .from("notification_settings")
    .select("value")
    .eq("key", "slow_page_load")
    .maybeSingle();
  const v = (data?.value ?? {}) as Partial<SlowPageConfig>;
  return { ...DEFAULTS, ...v, routes: v.routes ?? [], last_notified: v.last_notified ?? {} };
}

export async function saveSlowPageConfig(cfg: Partial<SlowPageConfig>): Promise<SlowPageConfig> {
  const current = await loadSlowPageConfig();
  const merged: SlowPageConfig = { ...current, ...cfg };
  await supabaseAdmin
    .from("notification_settings")
    .upsert(
      { key: "slow_page_load", value: merged as never, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  return merged;
}

async function sendOne(
  sub: { endpoint: string; p256dh: string; auth: string; who?: string | null },
  payload: string,
  ctx: { recipient: string; title: string; feature: string },
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    );
    void logPushSend({ feature: ctx.feature, recipient: ctx.recipient, ok: true, endpoint: sub.endpoint, title: ctx.title });
    return true;
  } catch (err) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 404 || e.statusCode === 410) {
      await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
    void logPushSend({ feature: ctx.feature, recipient: ctx.recipient, ok: false, endpoint: sub.endpoint, status_code: e.statusCode ?? null, error_message: e.message ?? null, title: ctx.title });
    return false;
  }
}

async function pushToRecipient(recipient: string, payload: string, title: string, feature: string) {
  let q = supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
  const orFilter = buildSubscriptionWhoOr(recipient);
  if (orFilter) q = q.or(orFilter);
  const { data: subs, error } = await q;
  if (error) return { sent: 0, errors: 1 };
  let sent = 0, errors = 0;
  for (const s of subs ?? []) {
    const ok = await sendOne(
      { endpoint: s.endpoint as string, p256dh: s.p256dh as string, auth: s.auth as string, who: (s as any).who ?? null },
      payload,
      { recipient, title, feature },
    );
    if (ok) sent++; else errors++;
  }
  return { sent, errors };
}

export async function processSlowPageLoadNotifications(): Promise<{
  checked: number; sent: number; errors: number; skipped: number;
}> {
  ensureConfigured();
  const cfg = await loadSlowPageConfig();
  if (!cfg.enabled && !cfg.slow_avg_enabled) return { checked: 0, sent: 0, errors: 0, skipped: 0 };

  const since = new Date(Date.now() - cfg.window_min * 60_000).toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from("page_load_log")
    .select("route, load_ms, device, loaded_at")
    .gte("loaded_at", since)
    .order("loaded_at", { ascending: false })
    .limit(5000);
  if (error) {
    console.warn("[slow-page-push] select failed", error.message);
    return { checked: 0, sent: 0, errors: 1, skipped: 0 };
  }

  const all = (rows ?? []).filter((r) => !cfg.only_mobile || (r.device ?? "").toLowerCase().startsWith("mobil"));
  const byRoute = new Map<string, number[]>();
  for (const r of all) {
    const arr = byRoute.get(r.route) ?? [];
    arr.push(r.load_ms as number);
    byRoute.set(r.route, arr);
  }

  const perRoute = new Map(cfg.routes.map((r) => [r.route, r.ms]));
  const now = Date.now();
  const lastNotified = { ...cfg.last_notified };
  let checked = 0, sent = 0, errors = 0, skipped = 0;

  if (cfg.enabled) {
    for (const [route, times] of byRoute) {
      checked++;
      if (times.length < cfg.min_samples) { skipped++; continue; }
      const threshold = perRoute.get(route) ?? cfg.default_ms;
      const avg = Math.round(times.reduce((s, x) => s + x, 0) / times.length);
      if (avg < threshold) { skipped++; continue; }
      const last = lastNotified[route];
      if (last && now - new Date(last).getTime() < cfg.cooldown_min * 60_000) { skipped++; continue; }

      const title = `🐢 Treg sidelasting: ${route}`;
      const body = `Snitt ${(avg / 1000).toFixed(1)}s siste ${cfg.window_min} min (terskel ${(threshold / 1000).toFixed(1)}s, ${times.length} målinger${cfg.only_mobile ? ", mobil" : ""}).`;
      const payload = JSON.stringify({ title, body, tag: `slow-page-${route}`, url: route });
      const r = await pushToRecipient(cfg.recipient || "Alle", payload, title, "slow-page-load");
      sent += r.sent; errors += r.errors;
      lastNotified[route] = new Date(now).toISOString();
    }
  }

  // Global snitt
  if (cfg.slow_avg_enabled && all.length >= cfg.min_samples) {
    const total = all.reduce((s, x) => s + (x.load_ms as number), 0);
    const avg = Math.round(total / all.length);
    if (avg >= cfg.slow_avg_ms) {
      const key = "__global__";
      const last = lastNotified[key];
      if (!last || now - new Date(last).getTime() >= cfg.cooldown_min * 60_000) {
        const title = `🐢 Lav ytelse på hele sidi`;
        const body = `Snitt ${(avg / 1000).toFixed(1)}s på tvers av ${all.length} målinger siste ${cfg.window_min} min (terskel ${(cfg.slow_avg_ms / 1000).toFixed(1)}s).`;
        const payload = JSON.stringify({ title, body, tag: `slow-page-global`, url: "/vakttarnet" });
        const r = await pushToRecipient(cfg.recipient || "Alle", payload, title, "slow-page-load-global");
        sent += r.sent; errors += r.errors;
        lastNotified[key] = new Date(now).toISOString();
      }
    }
  }

  await saveSlowPageConfig({ last_notified: lastNotified });
  return { checked, sent, errors, skipped };
}

export async function sendSlowPageLoadTest(): Promise<{ sent: number; errors: number }> {
  ensureConfigured();
  const cfg = await loadSlowPageConfig();
  const title = `🧪 TEST · 🐢 Treg sidelasting`;
  const body = `Slik ser varselet ut. Mottaker: ${cfg.recipient || "Alle"}. Standard terskel: ${(cfg.default_ms / 1000).toFixed(1)}s.`;
  const payload = JSON.stringify({ title, body, tag: `slow-page-test-${Date.now()}`, url: "/vakttarnet" });
  return pushToRecipient(cfg.recipient || "Alle", payload, title, "slow-page-load-test");
}
