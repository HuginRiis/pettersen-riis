/**
 * Push-varsler for utlån/lånte ting.
 * - Dagen forfallsdato treffes ("expected_return" er i dag): reminder_sent_at settes.
 * - Hver dag etter forfall uten retur: overdue-varsel (én gang totalt).
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

function todayOsloDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function sendOne(
  sub: { endpoint: string; p256dh: string; auth: string; who?: string | null },
  payload: string,
  ctx: { feature: string; recipient?: string; title?: string },
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    );
    void logPushSend({
      feature: ctx.feature,
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
      feature: ctx.feature,
      recipient: ctx.recipient || sub.who || "Alle",
      ok: false,
      endpoint: sub.endpoint,
      status_code: e.statusCode ?? null,
      error_message: e.message ?? null,
      title: ctx.title,
    });
    return false;
  }
}

export async function processLoanNotifications(): Promise<{
  checked: number;
  sent: number;
  errors: number;
}> {
  ensureConfigured();

  const today = todayOsloDate();
  const { data: loans, error } = await supabaseAdmin
    .from("loans")
    .select("id, direction, item, person, expected_return, returned_at, recipient, reminder_sent_at, overdue_notified_at")
    .is("returned_at", null)
    .not("expected_return", "is", null);
  if (error) throw error;
  if (!loans || loans.length === 0) return { checked: 0, sent: 0, errors: 0 };

  let checked = 0;
  let sent = 0;
  let errors = 0;

  for (const l of loans as Array<{
    id: string;
    direction: "utlan" | "lant";
    item: string;
    person: string;
    expected_return: string;
    recipient: string;
    reminder_sent_at: string | null;
    overdue_notified_at: string | null;
  }>) {
    const isOverdue = l.expected_return < today;
    const isDueToday = l.expected_return === today;

    let kind: "due" | "overdue" | null = null;
    if (isDueToday && !l.reminder_sent_at) kind = "due";
    else if (isOverdue && !l.overdue_notified_at) kind = "overdue";
    if (!kind) continue;

    checked++;
    const targetWho = l.recipient || "Alle";
    let subQuery = supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, who");
    if (targetWho !== "Alle") {
      const orFilter = buildSubscriptionWhoOr(targetWho);
      if (orFilter) subQuery = subQuery.or(orFilter);
    }
    const { data: subs } = await subQuery;

    const emoji = l.direction === "utlan" ? "📤" : "📥";
    const verb = l.direction === "utlan" ? "utlånt til" : "lånt av";
    const title =
      kind === "due"
        ? `${emoji} Retur i dag — ${l.item}`
        : `${emoji} Forfalt retur — ${l.item}`;
    const body =
      kind === "due"
        ? `${l.item} ${verb} ${l.person} skal returneres i dag.`
        : `${l.item} ${verb} ${l.person} skulle vært returnert ${l.expected_return}.`;
    const payload = JSON.stringify({
      title,
      body,
      tag: `loans-${l.id}-${kind}`,
      url: "/utlan",
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
        { feature: "loans", recipient: targetWho, title: l.item },
      );
      if (ok) sent++;
      else errors++;
    }

    const nowIso = new Date().toISOString();
    const upd: { reminder_sent_at?: string; overdue_notified_at?: string } = {};
    if (kind === "due") upd.reminder_sent_at = nowIso;
    if (kind === "overdue") upd.overdue_notified_at = nowIso;
    await supabaseAdmin.from("loans").update(upd).eq("id", l.id);
  }

  return { checked, sent, errors };
}

export async function sendLoanTestNotification(loanId: string): Promise<{
  sent: number;
  errors: number;
}> {
  ensureConfigured();
  const { data: l, error } = await supabaseAdmin
    .from("loans")
    .select("id, direction, item, person, expected_return, recipient")
    .eq("id", loanId)
    .maybeSingle();
  if (error) throw error;
  if (!l) throw new Error("Fant ikke utlånet");

  const targetWho = (l.recipient as string) || "Alle";
  let subQuery = supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, who");
  if (targetWho !== "Alle") {
    const orFilter = buildSubscriptionWhoOr(targetWho);
    if (orFilter) subQuery = subQuery.or(orFilter);
  }
  const { data: subs } = await subQuery;

  const emoji = (l as any).direction === "utlan" ? "📤" : "📥";
  const payload = JSON.stringify({
    title: `🧪 TEST: ${emoji} ${(l as any).item}`,
    body: `Test-varsel — ${(l as any).person}, forventet retur ${(l as any).expected_return ?? "—"}.`,
    tag: `loans-test-${l.id}-${Date.now()}`,
    url: "/utlan",
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
      { feature: "loans-test", recipient: targetWho, title: (l as any).item },
    );
    if (ok) sent++;
    else errors++;
  }
  return { sent, errors };
}
