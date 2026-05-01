/**
 * Vær-push-varsler. Brukerstyrte regler i `weather_notification_prefs`.
 * Hver regel sier: "varsle MOTTAKER kl HH:MM hver dag dersom værprognosen
 * for de neste N dagene viser KIND som overstiger TERSKEL ved LAT/LON".
 *
 * Kjøres fra agenda-push cron-hooken (hver time). Vi sender bare hvis
 * gjeldende Oslo-time/-minutt matcher pref.notify_hour/minute (innenfor
 * det aktuelle cron-intervallet).
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

export type WeatherKind =
  | "rain"
  | "wind"
  | "snow"
  | "frost"
  | "thunder"
  | "heat"
  | "fog";

export const WEATHER_KIND_META: Record<
  WeatherKind,
  { label: string; emoji: string; unit: string; defaultThreshold: number; symbolBased: boolean }
> = {
  rain:    { label: "Regn",      emoji: "🌧",  unit: "mm/t", defaultThreshold: 1,  symbolBased: false },
  wind:    { label: "Vind",      emoji: "💨", unit: "m/s",  defaultThreshold: 10, symbolBased: false },
  snow:    { label: "Snø",       emoji: "❄️", unit: "mm/t", defaultThreshold: 1,  symbolBased: false },
  frost:   { label: "Frost",     emoji: "🥶", unit: "°C",   defaultThreshold: 0,  symbolBased: false },
  thunder: { label: "Torden",    emoji: "⛈",  unit: "",     defaultThreshold: 0,  symbolBased: true  },
  heat:    { label: "Hete",      emoji: "🥵", unit: "°C",   defaultThreshold: 25, symbolBased: false },
  fog:     { label: "Tåke",      emoji: "🌫", unit: "",     defaultThreshold: 0,  symbolBased: true  },
};

type Series = Array<{
  time: string;
  temp: number | null;
  windSpeed: number | null;
  precip1h: number | null;
  symbol1h: string | null;
}>;

async function fetchForecast(lat: number, lon: number): Promise<Series | null> {
  try {
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "riis.cc agenda push (agenda@riis.cc)" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      properties?: {
        timeseries?: Array<{
          time: string;
          data?: {
            instant?: { details?: { air_temperature?: number; wind_speed?: number } };
            next_1_hours?: {
              summary?: { symbol_code?: string };
              details?: { precipitation_amount?: number };
            };
          };
        }>;
      };
    };
    const series: Series = [];
    for (const e of json.properties?.timeseries ?? []) {
      const inst = e.data?.instant?.details;
      const nh = e.data?.next_1_hours;
      series.push({
        time: e.time,
        temp: typeof inst?.air_temperature === "number" ? inst.air_temperature : null,
        windSpeed: typeof inst?.wind_speed === "number" ? inst.wind_speed : null,
        precip1h: typeof nh?.details?.precipitation_amount === "number" ? nh.details.precipitation_amount : null,
        symbol1h: nh?.summary?.symbol_code ?? null,
      });
    }
    return series;
  } catch (err) {
    console.error("[weather-push] met.no fetch failed", err);
    return null;
  }
}

type Pref = {
  id: string;
  location: string;
  label: string;
  lat: number;
  lon: number;
  kind: WeatherKind;
  threshold: number | null;
  recipient: string;
  days_ahead: number;
  notify_hour: number;
  notify_minute: number;
  enabled: boolean;
  last_notified_date: string | null;
  last_notified_signature: string | null;
};

export type WeatherEvalHit = {
  time: string;       // ISO
  value: number | null;
  symbol: string | null;
};

/**
 * Sjekker om en serie inneholder en hendelse som tilfredsstiller regelen.
 * `leadDays` = hvor mange dager FØR hendelsen vi vil ha varselet.
 *   - 0 = samme dag (sjekker resten av i dag)
 *   - 1 = varsle dagen før (sjekker hendelser på morgendagen, Oslo-tid)
 *   - N = varsle N dager før (sjekker hendelser på dagen N dager frem)
 * Returnerer første treff på den aktuelle dagen eller null.
 */
export function evaluateSeries(
  series: Series,
  kind: WeatherKind,
  threshold: number | null,
  leadDays: number,
): WeatherEvalHit | null {
  const meta = WEATHER_KIND_META[kind];
  const now = Date.now();
  const lead = Math.max(0, leadDays);
  const t = threshold ?? meta.defaultThreshold;

  // Beregn start/slutt av målgruppedagen i Oslo-tid
  const targetDateStr = osloDateString(new Date(now + lead * 24 * 3600 * 1000));
  // Konverter Oslo-dato til UTC-vindu (Oslo er UTC+1/+2). Bruk et sjenerøst vindu.
  const dayStart = new Date(`${targetDateStr}T00:00:00+01:00`).getTime() - 3600 * 1000;
  const dayEnd = new Date(`${targetDateStr}T23:59:59+01:00`).getTime() + 3600 * 1000;

  for (const e of series) {
    const ts = new Date(e.time).getTime();
    if (ts < Math.max(now, dayStart)) continue;
    if (ts > dayEnd) break;
    const sym = (e.symbol1h ?? "").toLowerCase();

    let hit = false;
    let value: number | null = null;

    switch (kind) {
      case "rain":
        value = e.precip1h;
        hit = value != null && value >= t;
        break;
      case "snow":
        value = e.precip1h;
        hit = value != null && value >= t && (sym.includes("snow") || sym.includes("sleet") || (e.temp != null && e.temp <= 1));
        break;
      case "wind":
        value = e.windSpeed;
        hit = value != null && value >= t;
        break;
      case "frost":
        value = e.temp;
        hit = value != null && value <= t;
        break;
      case "heat":
        value = e.temp;
        hit = value != null && value >= t;
        break;
      case "thunder":
        hit = sym.includes("thunder");
        break;
      case "fog":
        hit = sym.includes("fog");
        break;
    }

    if (hit) {
      return { time: e.time, value, symbol: e.symbol1h };
    }
  }
  return null;
}

function osloDateString(d: Date = new Date()): string {
  return new Date(d.toLocaleString("en-US", { timeZone: "Europe/Oslo" })).toISOString().slice(0, 10);
}

function osloHM(d: Date = new Date()): { h: number; m: number } {
  const o = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Oslo" }));
  return { h: o.getHours(), m: o.getMinutes() };
}

function formatOsloDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("nb-NO", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Oslo",
  });
}

function buildMessage(pref: Pref, hit: WeatherEvalHit): { title: string; body: string } {
  const meta = WEATHER_KIND_META[pref.kind];
  const when = formatOsloDateTime(hit.time);
  const valueStr = hit.value != null ? ` (${hit.value.toFixed(1)} ${meta.unit})` : "";
  const t = pref.threshold ?? meta.defaultThreshold;
  const thresholdStr = meta.symbolBased ? "" : ` ≥ ${t}${meta.unit ? " " + meta.unit : ""}`;
  return {
    title: `${meta.emoji} ${pref.label}: ${meta.label} venter${thresholdStr}`,
    body: `${meta.label} ${when}${valueStr}.`,
  };
}

async function sendOne(
  sub: { endpoint: string; p256dh: string; auth: string; who?: string | null },
  payload: string,
  ctx: { feature: string; recipient?: string; title?: string } = { feature: "weather" },
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
    console.error("[weather-push] send error", e.statusCode, e.message);
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

/**
 * Sjekker alle aktive regler. Sender kun for de hvis cron-tidspunkt matcher
 * nåværende Oslo-time (+/- 30 min) og som ikke allerede er varslet i dag
 * med samme signatur (hindrer duplikater).
 */
export async function processWeatherNotifications(): Promise<{
  checked: number;
  sent: number;
  errors: number;
  skipped: number;
}> {
  ensureConfigured();

  const today = osloDateString();
  const { h: nowH, m: nowM } = osloHM();
  const nowMinutes = nowH * 60 + nowM;

  const { data, error } = await supabaseAdmin
    .from("weather_notification_prefs" as never)
    .select("*")
    .eq("enabled", true);
  if (error) throw error;

  const prefs = (data ?? []) as unknown as Pref[];
  let checked = 0;
  let sent = 0;
  let errors = 0;
  let skipped = 0;

  // Cache prognoser per lat/lon for å spare MET-kall
  const forecastCache = new Map<string, Series | null>();

  for (const p of prefs) {
    checked++;
    const targetMinutes = p.notify_hour * 60 + p.notify_minute;
    // Aksepter +/- 30 min slik at det treffer uavhengig av om cron kjører hh:00 eller hh:05
    if (Math.abs(nowMinutes - targetMinutes) > 30) {
      skipped++;
      continue;
    }
    if (p.last_notified_date === today) {
      skipped++;
      continue;
    }

    const cacheKey = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
    if (!forecastCache.has(cacheKey)) {
      forecastCache.set(cacheKey, await fetchForecast(p.lat, p.lon));
    }
    const series = forecastCache.get(cacheKey);
    if (!series) {
      skipped++;
      continue;
    }

    const hit = evaluateSeries(series, p.kind, p.threshold, p.days_ahead);
    if (!hit) {
      // Ingen treff — marker som "sjekket i dag" så vi ikke kjører igjen senere på dagen
      await supabaseAdmin
        .from("weather_notification_prefs" as never)
        .update({ last_notified_date: today, last_notified_signature: "no-hit" } as never)
        .eq("id", p.id);
      skipped++;
      continue;
    }

    const signature = `${p.kind}:${hit.time}`;
    const { title, body } = buildMessage(p, hit);

    const targetWho = p.recipient || "Alle";
    let subQuery = supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
    if (targetWho !== "Alle") subQuery = subQuery.or(`who.eq.${targetWho},who.eq.Alle`);
    const { data: subs, error: subErr } = await subQuery;
    if (subErr) {
      errors++;
      continue;
    }

    const payload = JSON.stringify({
      title,
      body,
      tag: `weather-${p.id}-${today}`,
      url: "/var",
    });

    for (const sub of subs ?? []) {
      const ok = await sendOne(
        { endpoint: sub.endpoint as string, p256dh: sub.p256dh as string, auth: sub.auth as string, who: (sub as any).who ?? null },
        payload,
        { feature: "weather", recipient: p.recipient ?? "Alle", title },
      );
      if (ok) sent++;
      else errors++;
    }

    await supabaseAdmin
      .from("weather_notification_prefs" as never)
      .update({ last_notified_date: today, last_notified_signature: signature } as never)
      .eq("id", p.id);
  }

  return { checked, sent, errors, skipped };
}

/**
 * Sender et test-push for én regel uavhengig av tid eller terskler.
 */
export async function sendWeatherTestNotification(prefId: string): Promise<{
  sent: number;
  errors: number;
  recipient: string;
  label: string;
}> {
  ensureConfigured();

  const { data: pref, error } = await supabaseAdmin
    .from("weather_notification_prefs" as never)
    .select("*")
    .eq("id", prefId)
    .maybeSingle();
  if (error) throw error;
  if (!pref) throw new Error("Fant ikke vær-regel");
  const p = pref as unknown as Pref;

  const series = (await fetchForecast(p.lat, p.lon)) ?? [];
  const hit =
    evaluateSeries(series, p.kind, p.threshold, Math.max(p.days_ahead, 1)) ?? {
      time: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
      value: p.threshold ?? WEATHER_KIND_META[p.kind].defaultThreshold,
      symbol: null,
    };

  const { title, body } = buildMessage(p, hit);
  const targetWho = p.recipient || "Alle";
  let subQuery = supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
  if (targetWho !== "Alle") subQuery = subQuery.or(`who.eq.${targetWho},who.eq.Alle`);
  const { data: subs, error: subErr } = await subQuery;
  if (subErr) throw subErr;

  const payload = JSON.stringify({
    title: `🧪 TEST: ${title}`,
    body: body + " (test)",
    tag: `weather-test-${p.id}-${Date.now()}`,
    url: "/var",
  });

  let sent = 0;
  let errors = 0;
  for (const sub of subs ?? []) {
    const ok = await sendOne(
      { endpoint: sub.endpoint as string, p256dh: sub.p256dh as string, auth: sub.auth as string },
      payload,
    );
    if (ok) sent++;
    else errors++;
  }
  return { sent, errors, recipient: targetWho, label: p.label };
}

/**
 * Returnerer en kort prognose per regel: hva som ville utløst varsel innenfor
 * regelens horisont. Brukes av UI for "neste varsel"-tekst.
 */
export async function computeWeatherForecast(): Promise<
  Array<{
    id: string;
    label: string;
    kind: WeatherKind;
    enabled: boolean;
    nextAt: string | null;
    value: number | null;
    threshold: number;
    reason: string;
  }>
> {
  const { data, error } = await supabaseAdmin
    .from("weather_notification_prefs" as never)
    .select("*")
    .order("location");
  if (error) throw error;
  const prefs = (data ?? []) as unknown as Pref[];

  const cache = new Map<string, Series | null>();
  const out: Awaited<ReturnType<typeof computeWeatherForecast>> = [];
  for (const p of prefs) {
    const meta = WEATHER_KIND_META[p.kind];
    const t = p.threshold ?? meta.defaultThreshold;
    if (!p.enabled) {
      out.push({
        id: p.id,
        label: p.label,
        kind: p.kind,
        enabled: false,
        nextAt: null,
        value: null,
        threshold: t,
        reason: "Av",
      });
      continue;
    }
    const key = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
    if (!cache.has(key)) cache.set(key, await fetchForecast(p.lat, p.lon));
    const s = cache.get(key);
    if (!s) {
      out.push({
        id: p.id,
        label: p.label,
        kind: p.kind,
        enabled: true,
        nextAt: null,
        value: null,
        threshold: t,
        reason: "Mangler prognose",
      });
      continue;
    }
    const hit = evaluateSeries(s, p.kind, p.threshold, p.days_ahead);
    out.push({
      id: p.id,
      label: p.label,
      kind: p.kind,
      enabled: true,
      nextAt: hit?.time ?? null,
      value: hit?.value ?? null,
      threshold: t,
      reason: hit ? "" : `Ingen ${meta.label.toLowerCase()} forventet neste ${p.days_ahead} d`,
    });
  }
  return out;
}
