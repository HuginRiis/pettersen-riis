/**
 * Sender push-varsler basert på UV-prognose fra MET.no for hver lokasjon
 * (Borgen og Hytta). Følger Direktoratet for strålevern (DSA) sine råd:
 *   - UV ≥ 3: bruk solkrem SPF 30
 *   - UV ≥ 6: SPF 30 + dekk til med klær / søk skygge midt på dagen
 *   - UV ≥ 8: unngå sol mellom kl 12-15
 *
 * Maks ett varsel per nivå per dag per lokasjon. Kjører hver time mellom 09-17
 * via agenda-push cron-hooken.
 */
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

const LEVELS = [
  {
    threshold: 8,
    column: "notified_date_8" as const,
    title: "☀️ Ekstrem UV — unngå sol",
    body: (loc: string, uv: number) =>
      `${loc}: UV ${uv.toFixed(1)}. Unngå sol kl 12-15. Bruk SPF 50, dekk til med klær og søk skygge.`,
  },
  {
    threshold: 6,
    column: "notified_date_6" as const,
    title: "🧴 Styrk solbeskyttelsen",
    body: (loc: string, uv: number) =>
      `${loc}: UV ${uv.toFixed(1)}. Smør med SPF 30+, bruk solhatt og lette klær. Søk skygge midt på dagen.`,
  },
  {
    threshold: 3,
    column: "notified_date_3" as const,
    title: "🧴 På tide med solkrem",
    body: (loc: string, uv: number) =>
      `${loc}: UV ${uv.toFixed(1)}. Bruk solkrem SPF 30 på utsatt hud (DSA-anbefaling).`,
  },
] as const;

async function fetchUvNow(lat: number, lon: number): Promise<number | null> {
  try {
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat}&lon=${lon}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "riis.cc agenda push (agenda@riis.cc)" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      properties?: { timeseries?: Array<{ time: string; data?: { instant?: { details?: { ultraviolet_index_clear_sky?: number } } } }> };
    };
    const series = json.properties?.timeseries ?? [];
    if (!series.length) return null;
    const now = Date.now();
    let best: { uv: number; diff: number } | null = null;
    for (const e of series) {
      const uv = e?.data?.instant?.details?.ultraviolet_index_clear_sky;
      if (typeof uv !== "number") continue;
      const t = new Date(e.time).getTime();
      const diff = Math.abs(t - now);
      if (!best || diff < best.diff) best = { uv, diff };
      if (diff > 4 * 3600 * 1000 && best) break;
    }
    return best?.uv ?? null;
  } catch (err) {
    console.error("[uv-push] met.no fetch failed", err);
    return null;
  }
}

async function sendOne(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: string,
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    );
    return true;
  } catch (err) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 404 || e.statusCode === 410) {
      await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
    console.error("[uv-push] send error", e.statusCode, e.message);
    return false;
  }
}

export async function processUvNotifications(): Promise<{
  checked: number;
  sent: number;
  errors: number;
  skipped: number;
}> {
  ensureConfigured();

  // Kun kjør i dagslys-vinduet (09-17 norsk tid). Bruk Europe/Oslo offset enkelt.
  const nowOslo = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Oslo" }));
  const hour = nowOslo.getHours();
  if (hour < 9 || hour > 17) return { checked: 0, sent: 0, errors: 0, skipped: 0 };

  const today = nowOslo.toISOString().slice(0, 10);

  const { data: prefs, error } = await supabaseAdmin
    .from("uv_notification_prefs" as never)
    .select("*")
    .eq("enabled", true);

  if (error) throw error;
  if (!prefs || prefs.length === 0) return { checked: 0, sent: 0, errors: 0, skipped: 0 };

  let checked = 0;
  let sent = 0;
  let errors = 0;
  let skipped = 0;

  for (const p of prefs as Array<{
    id: string;
    location: string;
    label: string;
    lat: number;
    lon: number;
    recipient: string;
    notified_date_3: string | null;
    notified_date_6: string | null;
    notified_date_8: string | null;
  }>) {
    checked++;
    const uv = await fetchUvNow(p.lat, p.lon);
    if (uv == null) {
      skipped++;
      continue;
    }

    // Finn høyeste nivå som er nådd og ikke varslet i dag.
    let trigger: (typeof LEVELS)[number] | null = null;
    for (const lvl of LEVELS) {
      if (uv >= lvl.threshold) {
        const last = p[lvl.column];
        if (last !== today) {
          trigger = lvl;
          break;
        }
      }
    }
    if (!trigger) {
      skipped++;
      continue;
    }

    const targetWho = p.recipient || "Alle";
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
      title: trigger.title,
      body: trigger.body(p.label, uv),
      tag: `uv-${p.location}-${trigger.threshold}-${today}`,
      url: "/var",
    });

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

    // Marker som varslet for dette nivået i dag (uansett — unngå spam).
    await supabaseAdmin
      .from("uv_notification_prefs" as never)
      .update({ [trigger.column]: today } as never)
      .eq("id", p.id);
  }

  return { checked, sent, errors, skipped };
}

/**
 * Sender et test-push for UV-varsel for én lokasjon, uavhengig av faktisk UV
 * eller om det er sendt varsel i dag. Brukes fra innstillingspanelet.
 */
export async function sendUvTestNotification(
  prefId: string,
  level: 3 | 6 | 8 = 3,
): Promise<{ sent: number; errors: number; recipient: string; label: string }> {
  ensureConfigured();

  const { data: pref, error } = await supabaseAdmin
    .from("uv_notification_prefs" as never)
    .select("*")
    .eq("id", prefId)
    .maybeSingle();
  if (error) throw error;
  if (!pref) throw new Error("Fant ikke UV-innstilling");

  const p = pref as unknown as { label: string; recipient: string };
  const lvl = LEVELS.find((l) => l.threshold === level) ?? LEVELS[LEVELS.length - 1];
  const fakeUv = level === 8 ? 8.2 : level === 6 ? 6.3 : 3.5;

  const targetWho = p.recipient || "Alle";
  let subQuery = supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, who");
  if (targetWho !== "Alle") {
    subQuery = subQuery.or(`who.eq.${targetWho},who.eq.Alle`);
  }
  const { data: subs, error: subErr } = await subQuery;
  if (subErr) throw subErr;

  const payload = JSON.stringify({
    title: `🧪 TEST: ${lvl.title}`,
    body: lvl.body(p.label, fakeUv) + " (test)",
    tag: `uv-test-${prefId}-${Date.now()}`,
    url: "/var",
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

  return { sent, errors, recipient: targetWho, label: p.label };
}
