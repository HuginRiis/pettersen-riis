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

// Standard lead-tid hvis ikke annet er satt på lokasjonen.
const LEAD_MINUTES = 30;

function leadLabel(min: number): string {
  if (min <= 0) return "nå";
  return `om ca ${min} min`;
}

const LEVELS = [
  {
    threshold: 8,
    column: "notified_date_8" as const,
    title: (lead: number) =>
      lead <= 0 ? "☀️ Ekstrem UV nå" : `☀️ Ekstrem UV om ${lead} min — forbered deg`,
    body: (loc: string, uv: number, lead: number) =>
      `${loc}: UV når ${uv.toFixed(1)} ${leadLabel(lead)}. Unngå sol kl 12-15. Smør med SPF 50, finn klær og skygge.`,
  },
  {
    threshold: 6,
    column: "notified_date_6" as const,
    title: (lead: number) =>
      lead <= 0 ? "🧴 Sterk UV nå — styrk beskyttelsen" : `🧴 Sterk UV om ${lead} min — styrk beskyttelsen`,
    body: (loc: string, uv: number, lead: number) =>
      `${loc}: UV når ${uv.toFixed(1)} ${leadLabel(lead)}. Smør med SPF 30+, ta på solhatt og lette klær. Søk skygge midt på dagen.`,
  },
  {
    threshold: 3,
    column: "notified_date_3" as const,
    title: (lead: number) => (lead <= 0 ? "🧴 På tide med solkrem" : `🧴 Solkrem om ${lead} min`),
    body: (loc: string, uv: number, lead: number) =>
      `${loc}: UV når ${uv.toFixed(1)} ${leadLabel(lead)}. Smør med SPF 30 på utsatt hud (DSA-anbefaling).`,
  },
] as const;

/**
 * Henter forventet UV ~`leadMinutes` frem i tid fra MET.no, slik at vi
 * kan varsle FØR terskelen faktisk nås.
 */
async function fetchUvAhead(
  lat: number,
  lon: number,
  leadMinutes = LEAD_MINUTES,
): Promise<number | null> {
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
    const target = Date.now() + leadMinutes * 60 * 1000;
    let best: { uv: number; diff: number } | null = null;
    for (const e of series) {
      const uv = e?.data?.instant?.details?.ultraviolet_index_clear_sky;
      if (typeof uv !== "number") continue;
      const t = new Date(e.time).getTime();
      const diff = Math.abs(t - target);
      if (!best || diff < best.diff) best = { uv, diff };
      if (t - target > 4 * 3600 * 1000 && best) break;
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

  // Kjør 08:30-17 norsk tid så vi rekker 30-min lead før første UV-terskel.
  const nowOslo = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Oslo" }));
  const hour = nowOslo.getHours();
  const minute = nowOslo.getMinutes();
  const inWindow = (hour > 8 || (hour === 8 && minute >= 30)) && hour <= 17;
  if (!inWindow) return { checked: 0, sent: 0, errors: 0, skipped: 0 };

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
    lead_minutes: number | null;
    notified_date_3: string | null;
    notified_date_6: string | null;
    notified_date_8: string | null;
  }>) {
    checked++;
    const lead = typeof p.lead_minutes === "number" ? p.lead_minutes : LEAD_MINUTES;
    const uv = await fetchUvAhead(p.lat, p.lon, lead);
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
      title: trigger.title(lead),
      body: trigger.body(p.label, uv, lead),
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

  const p = pref as unknown as { label: string; recipient: string; lead_minutes?: number | null };
  const lvl = LEVELS.find((l) => l.threshold === level) ?? LEVELS[LEVELS.length - 1];
  const fakeUv = level === 8 ? 8.2 : level === 6 ? 6.3 : 3.5;
  const lead = typeof p.lead_minutes === "number" ? p.lead_minutes : LEAD_MINUTES;

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
    title: `🧪 TEST: ${lvl.title(lead)}`,
    body: lvl.body(p.label, fakeUv, lead) + " (test)",
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
