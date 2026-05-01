/**
 * Sender push-varsler når en kvittering nærmer seg utløp av 5-års garanti.
 * Trigger: 90, 60 og 30 dager før garantiutløp.
 * Mottaker styres per kvittering via warranty_recipient (default 'Alle').
 */
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logPushSend } from "./push-log.server";

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

const MILESTONES = [90, 60, 30] as const;
type Milestone = (typeof MILESTONES)[number];

const colName = (m: Milestone) =>
  m === 90 ? "warranty_notified_90" : m === 60 ? "warranty_notified_60" : "warranty_notified_30";

function daysUntilWarrantyExpiry(purchased_at: string): number | null {
  const d = new Date(purchased_at);
  if (Number.isNaN(d.getTime())) return null;
  const w = new Date(d);
  w.setFullYear(w.getFullYear() + 5);
  const diff = w.getTime() - Date.now();
  return Math.floor(diff / 86400000);
}

async function sendOne(
  sub: { endpoint: string; p256dh: string; auth: string; who?: string | null },
  payload: string,
  ctx: { feature: string; recipient?: string; title?: string } = { feature: "warranty" },
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
    console.error("[warranty-push] send error", e.statusCode, e.message);
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

export async function processWarrantyNotifications(): Promise<{
  checked: number;
  sent: number;
  errors: number;
}> {
  ensureConfigured();

  // Hent kvitteringer som er kandidat: ikke matvare, har dato, ikke utløpt.
  const { data: receipts, error } = await supabaseAdmin
    .from("receipts")
    .select(
      "id, store, purchased_at, is_food, warranty_recipient, warranty_notified_90, warranty_notified_60, warranty_notified_30",
    )
    .eq("is_food", false)
    .not("purchased_at", "is", null);

  if (error) throw error;
  if (!receipts || receipts.length === 0) return { checked: 0, sent: 0, errors: 0 };

  let sent = 0;
  let errors = 0;
  let checked = 0;

  for (const r of receipts as Array<{
    id: string;
    store: string | null;
    purchased_at: string;
    warranty_recipient: string;
    warranty_notified_90: string | null;
    warranty_notified_60: string | null;
    warranty_notified_30: string | null;
  }>) {
    const daysLeft = daysUntilWarrantyExpiry(r.purchased_at);
    if (daysLeft == null || daysLeft < 0) continue;

    // Finn første milepæl som er passert/aktuell og som ikke er varslet ennå.
    let trigger: Milestone | null = null;
    for (const m of MILESTONES) {
      const already = r[colName(m) as keyof typeof r];
      if (!already && daysLeft <= m) {
        trigger = m;
        break; // start med høyeste milepæl (90), kun ett varsel per kjøring per kvittering
      }
    }
    if (!trigger) continue;
    checked++;

    const targetWho = r.warranty_recipient || "Alle";
    let subQuery = supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, who");
    if (targetWho !== "Alle") {
      subQuery = subQuery.or(`who.eq.${targetWho},who.eq.Alle`);
    }
    const { data: subs, error: subErr } = await subQuery;
    if (subErr) {
      errors++;
      continue;
    }

    const payload = JSON.stringify({
      title: `🛡️ Garanti utløper snart — ${r.store ?? "kvittering"}`,
      body: `${daysLeft} dag${daysLeft === 1 ? "" : "er"} igjen på 5-års garantien (varsel ${trigger} dager).`,
      tag: `warranty-${r.id}-${trigger}`,
      url: "/kvitteringer",
    });

    let okForThis = 0;
    for (const sub of subs ?? []) {
      const ok = await sendOne(
        {
          endpoint: sub.endpoint as string,
          p256dh: sub.p256dh as string,
          auth: sub.auth as string,
        },
        payload,
      );
      if (ok) {
        sent++;
        okForThis++;
      } else {
        errors++;
      }
    }

    // Marker som varslet uansett — unngå spam ved feil.
    const nowIso = new Date().toISOString();
    const update: {
      warranty_notified_90?: string;
      warranty_notified_60?: string;
      warranty_notified_30?: string;
    } = {};
    if (trigger === 90) update.warranty_notified_90 = nowIso;
    if (trigger === 60) update.warranty_notified_60 = nowIso;
    if (trigger === 30) update.warranty_notified_30 = nowIso;
    await supabaseAdmin.from("receipts").update(update).eq("id", r.id);
    void okForThis;
  }

  return { checked, sent, errors };
}

/**
 * Sender et test-push for én kvittering uavhengig av dato/milepæl.
 */
export async function sendWarrantyTestNotification(receiptId: string): Promise<{
  sent: number;
  errors: number;
  recipient: string;
  store: string | null;
}> {
  ensureConfigured();

  const { data: r, error } = await supabaseAdmin
    .from("receipts")
    .select("id, store, purchased_at, warranty_recipient")
    .eq("id", receiptId)
    .maybeSingle();
  if (error) throw error;
  if (!r) throw new Error("Fant ikke kvitteringen");

  const targetWho = (r.warranty_recipient as string) || "Alle";
  let subQuery = supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, who");
  if (targetWho !== "Alle") {
    subQuery = subQuery.or(`who.eq.${targetWho},who.eq.Alle`);
  }
  const { data: subs, error: subErr } = await subQuery;
  if (subErr) throw subErr;

  const daysLeft = r.purchased_at ? daysUntilWarrantyExpiry(r.purchased_at as string) : null;
  const daysStr = daysLeft != null && daysLeft >= 0 ? `${daysLeft} dager igjen` : "test";

  const payload = JSON.stringify({
    title: `🧪 TEST: 🛡️ Garanti — ${r.store ?? "kvittering"}`,
    body: `Test-varsel for 5-års garanti (${daysStr}).`,
    tag: `warranty-test-${r.id}-${Date.now()}`,
    url: "/kvitteringer",
  });

  let sent = 0;
  let errors = 0;
  for (const sub of subs ?? []) {
    const ok = await sendOne(
      {
        endpoint: sub.endpoint as string,
        p256dh: sub.p256dh as string,
        auth: sub.auth as string,
      },
      payload,
    );
    if (ok) sent++;
    else errors++;
  }
  return { sent, errors, recipient: targetWho, store: (r.store as string) ?? null };
}
