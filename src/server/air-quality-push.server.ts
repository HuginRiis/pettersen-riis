/**
 * Push-varsler for luftkvalitet per lokasjon. Henter live data fra Open-Meteo
 * Air Quality API og varsler når en metrikk passerer brukerens terskel.
 * Nedkjølings-tid (`cooldown_minutes`) hindrer spam per metrikk.
 */
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logPushSend } from "./push-log.server";
import { buildSubscriptionWhoOr } from "./push-recipients";
import { loggedFetch } from "./api-call-log.server";

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

type MetricKey = "aqi" | "pm25" | "pm10" | "no2" | "o3" | "so2" | "dust";

type Pref = {
  id: string;
  location: string;
  label: string;
  lat: number;
  lon: number;
  enabled: boolean;
  recipient: string;
  cooldown_minutes: number;
  notify_aqi: boolean;
  aqi_threshold: number;
  notify_pm25: boolean;
  pm25_threshold: number;
  notify_pm10: boolean;
  pm10_threshold: number;
  notify_no2: boolean;
  no2_threshold: number;
  notify_o3: boolean;
  o3_threshold: number;
  notify_so2: boolean;
  so2_threshold: number;
  notify_dust: boolean;
  dust_threshold: number;
  last_notified_aqi_at: string | null;
  last_notified_pm25_at: string | null;
  last_notified_pm10_at: string | null;
  last_notified_no2_at: string | null;
  last_notified_o3_at: string | null;
  last_notified_so2_at: string | null;
  last_notified_dust_at: string | null;
};

const METRICS: {
  key: MetricKey;
  label: string;
  unit: string;
  emoji: string;
  field: keyof Pref;
  enabledField: keyof Pref;
  thresholdField: keyof Pref;
  lastField: keyof Pref;
  apiField: string;
  advice: string;
}[] = [
  {
    key: "aqi",
    label: "AQI",
    unit: "",
    emoji: "🟧",
    field: "aqi_threshold",
    enabledField: "notify_aqi",
    thresholdField: "aqi_threshold",
    lastField: "last_notified_aqi_at",
    apiField: "european_aqi",
    advice: "Luftkvaliteten er dårlig — sårbare bør begrense aktivitet ute.",
  },
  {
    key: "pm25",
    label: "PM2.5",
    unit: " µg/m³",
    emoji: "💨",
    field: "pm25_threshold",
    enabledField: "notify_pm25",
    thresholdField: "pm25_threshold",
    lastField: "last_notified_pm25_at",
    apiField: "pm2_5",
    advice: "Fine svevestøv-partikler høyt — astma/allergi kan reagere.",
  },
  {
    key: "pm10",
    label: "PM10",
    unit: " µg/m³",
    emoji: "🌫️",
    field: "pm10_threshold",
    enabledField: "notify_pm10",
    thresholdField: "pm10_threshold",
    lastField: "last_notified_pm10_at",
    apiField: "pm10",
    advice: "Mye grovt svevestøv — vurder å lukke vinduer.",
  },
  {
    key: "no2",
    label: "NO₂",
    unit: " µg/m³",
    emoji: "🚗",
    field: "no2_threshold",
    enabledField: "notify_no2",
    thresholdField: "no2_threshold",
    lastField: "last_notified_no2_at",
    apiField: "nitrogen_dioxide",
    advice: "Høy NO₂ (trafikk) — unngå tett trafikk ved trening.",
  },
  {
    key: "o3",
    label: "O₃",
    unit: " µg/m³",
    emoji: "☀️",
    field: "o3_threshold",
    enabledField: "notify_o3",
    thresholdField: "o3_threshold",
    lastField: "last_notified_o3_at",
    apiField: "ozone",
    advice: "Bakkenært ozon høyt — kan irritere luftveiene.",
  },
  {
    key: "so2",
    label: "SO₂",
    unit: " µg/m³",
    emoji: "🏭",
    field: "so2_threshold",
    enabledField: "notify_so2",
    thresholdField: "so2_threshold",
    lastField: "last_notified_so2_at",
    apiField: "sulphur_dioxide",
    advice: "Høy SO₂ — kan irritere øyne og luftveier.",
  },
  {
    key: "dust",
    label: "Støv",
    unit: " µg/m³",
    emoji: "🏜️",
    field: "dust_threshold",
    enabledField: "notify_dust",
    thresholdField: "dust_threshold",
    lastField: "last_notified_dust_at",
    apiField: "dust",
    advice: "Mye mineralstøv (f.eks. Sahara) — hold vinduer lukket.",
  },
];

type Current = Partial<Record<string, number>>;

async function fetchCurrent(lat: number, lon: number): Promise<Current | null> {
  try {
    const fields = METRICS.map((m) => m.apiField).join(",");
    const url =
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&current=${fields}&timezone=Europe%2FOslo`;
    const res = await loggedFetch("air-quality", "open-meteo:air-quality", url, {
      headers: { "User-Agent": "riis.cc air quality push (agenda@riis.cc)" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { current?: Record<string, unknown> };
    return (json.current ?? null) as Current | null;
  } catch (err) {
    console.error("[air-quality-push] open-meteo fetch failed", err);
    return null;
  }
}

async function sendOne(
  sub: { endpoint: string; p256dh: string; auth: string; who?: string | null },
  payload: string,
  ctx: { feature: string; recipient: string; title: string },
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

async function loadSubs(who: string) {
  let q = supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
  const orFilter = buildSubscriptionWhoOr(who);
  if (orFilter) q = q.or(orFilter);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function processAirQualityNotifications(): Promise<{
  checked: number;
  sent: number;
  errors: number;
  skipped: number;
}> {
  ensureConfigured();

  const { data: prefs, error } = await supabaseAdmin
    .from("air_quality_notification_prefs" as never)
    .select("*")
    .eq("enabled", true);

  if (error) throw error;
  if (!prefs || prefs.length === 0) return { checked: 0, sent: 0, errors: 0, skipped: 0 };

  let checked = 0;
  let sent = 0;
  let errors = 0;
  let skipped = 0;

  for (const p of prefs as unknown as Pref[]) {
    checked++;
    const current = await fetchCurrent(p.lat, p.lon);
    if (!current) {
      skipped++;
      continue;
    }

    const now = Date.now();
    const cooldownMs = (p.cooldown_minutes ?? 180) * 60 * 1000;
    const updates: Record<string, unknown> = { last_checked_at: new Date().toISOString() };

    for (const m of METRICS) {
      if (!p[m.enabledField]) continue;
      const value = current[m.apiField];
      if (typeof value !== "number") continue;
      const threshold = Number(p[m.thresholdField]);
      if (!(value >= threshold)) continue;

      const last = p[m.lastField] as string | null;
      if (last && now - new Date(last).getTime() < cooldownMs) continue;

      const targetWho = p.recipient || "Alle";
      const subs = await loadSubs(targetWho).catch(() => {
        errors++;
        return [] as Awaited<ReturnType<typeof loadSubs>>;
      });

      const locPrefix = p.location === "hytta" ? "Fra hytta 🛖" : "Fra Tollnes 🏠";
      const title = `${m.emoji} ${m.label} høy — ${p.label}`;
      const body =
        `${m.label} er ${value.toFixed(value < 10 ? 1 : 0)}${m.unit} ` +
        `(terskel ${threshold}${m.unit}). ${m.advice}`;
      const payload = JSON.stringify({
        title: `${locPrefix} · ${title}`,
        body,
        tag: `aq-${p.location}-${m.key}-${new Date().toISOString().slice(0, 13)}`,
        url: "/pollen",
      });

      for (const sub of subs) {
        const ok = await sendOne(
          {
            endpoint: sub.endpoint as string,
            p256dh: sub.p256dh as string,
            auth: sub.auth as string,
            who: (sub as { who?: string | null }).who ?? null,
          },
          payload,
          { feature: `air-quality:${m.key}`, recipient: targetWho, title },
        );
        if (ok) sent++;
        else errors++;
      }

      updates[m.lastField as string] = new Date().toISOString();
    }

    await supabaseAdmin
      .from("air_quality_notification_prefs" as never)
      .update(updates as never)
      .eq("id", p.id);

    if (Object.keys(updates).length === 1) skipped++;
  }

  return { checked, sent, errors, skipped };
}

/**
 * Sender et test-push for én metrikk uavhengig av faktiske verdier.
 */
export async function sendAirQualityTestNotification(
  prefId: string,
  metric: MetricKey,
): Promise<{ sent: number; errors: number; recipient: string; label: string }> {
  ensureConfigured();

  const { data: pref, error } = await supabaseAdmin
    .from("air_quality_notification_prefs" as never)
    .select("*")
    .eq("id", prefId)
    .maybeSingle();
  if (error) throw error;
  if (!pref) throw new Error("Fant ikke luftkvalitet-innstilling");

  const p = pref as unknown as Pref;
  const m = METRICS.find((x) => x.key === metric) ?? METRICS[0];
  const targetWho = p.recipient || "Alle";
  const subs = await loadSubs(targetWho);

  const fakeValue = Number(p[m.thresholdField]) + (m.key === "aqi" ? 5 : 5);
  const locPrefix = p.location === "hytta" ? "Fra hytta 🛖" : "Fra Tollnes 🏠";
  const title = `🧪 TEST · ${m.emoji} ${m.label} høy — ${p.label}`;
  const body =
    `${m.label} er ${fakeValue.toFixed(m.key === "aqi" ? 0 : 1)}${m.unit} ` +
    `(terskel ${p[m.thresholdField]}${m.unit}). ${m.advice} (test)`;
  const payload = JSON.stringify({
    title,
    body,
    tag: `aq-test-${prefId}-${m.key}-${Date.now()}`,
    url: "/pollen",
  });

  let sent = 0;
  let errors = 0;
  for (const sub of subs) {
    const ok = await sendOne(
      {
        endpoint: sub.endpoint as string,
        p256dh: sub.p256dh as string,
        auth: sub.auth as string,
        who: (sub as { who?: string | null }).who ?? null,
      },
      payload,
      { feature: `air-quality-test:${m.key}`, recipient: targetWho, title },
    );
    if (ok) sent++;
    else errors++;
  }

  return { sent, errors, recipient: targetWho, label: `${p.label} · ${m.label}` };
}

void locPrefix;
function locPrefix() {
  /* unused */
}
