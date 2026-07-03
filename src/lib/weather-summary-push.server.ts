/**
 * Daglig værmelding-push per bruker. En rad per person i
 * `weather_summary_push_prefs` med to tidsluker (slot 1 & slot 2). Hver
 * tidsluke har eget klokkeslett og velger om det er «dagens» eller
 * «morgendagens» vær som skal oppsummeres.
 *
 * Lokasjon plukkes fra `user_location_prefs` (siste kjente for personen);
 * ellers fallback til Borgen · Tollnes.
 *
 * Cron kjøres fra agenda-push hooken. Vi sender kun hvis nåværende
 * Oslo-time/-minutt er innenfor +/-30 min av tidsluken og vi ikke allerede
 * har sendt den luken i dag.
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

const FALLBACK_LOCATION = { label: "Borgen · Tollnes", lat: 59.1789, lon: 9.5732 };

export type SummaryTarget = "today" | "tomorrow";

export type SummaryPref = {
  id: string;
  who: string;
  enabled: boolean;
  slot1_enabled: boolean;
  slot1_hour: number;
  slot1_minute: number;
  slot1_target: SummaryTarget;
  slot2_enabled: boolean;
  slot2_hour: number;
  slot2_minute: number;
  slot2_target: SummaryTarget;
  include_symbol: boolean;
  include_temp_range: boolean;
  include_precip: boolean;
  include_wind: boolean;
  include_sunrise_sunset: boolean;
  include_uv: boolean;
  include_summary: boolean;
  last_sent_slot1_date: string | null;
  last_sent_slot2_date: string | null;
};

type Slot = 1 | 2;

type Series = Array<{
  time: string;
  temp: number | null;
  windSpeed: number | null;
  precip1h: number | null;
  symbol1h: string | null;
  symbol6h: string | null;
}>;

function osloDateString(d: Date = new Date()): string {
  return new Date(d.toLocaleString("en-US", { timeZone: "Europe/Oslo" })).toISOString().slice(0, 10);
}
function osloHM(d: Date = new Date()): { h: number; m: number } {
  const o = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Oslo" }));
  return { h: o.getHours(), m: o.getMinutes() };
}

async function fetchForecast(lat: number, lon: number): Promise<Series | null> {
  try {
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
    const res = await loggedFetch("met", "locationforecast", url, {
      headers: { "User-Agent": "riis.cc weather-summary push (agenda@riis.cc)" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      properties?: {
        timeseries?: Array<{
          time: string;
          data?: {
            instant?: { details?: { air_temperature?: number; wind_speed?: number } };
            next_1_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } };
            next_6_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } };
          };
        }>;
      };
    };
    const series: Series = [];
    for (const e of json.properties?.timeseries ?? []) {
      const inst = e.data?.instant?.details;
      series.push({
        time: e.time,
        temp: typeof inst?.air_temperature === "number" ? inst.air_temperature : null,
        windSpeed: typeof inst?.wind_speed === "number" ? inst.wind_speed : null,
        precip1h: typeof e.data?.next_1_hours?.details?.precipitation_amount === "number"
          ? e.data.next_1_hours.details.precipitation_amount : null,
        symbol1h: e.data?.next_1_hours?.summary?.symbol_code ?? null,
        symbol6h: e.data?.next_6_hours?.summary?.symbol_code ?? null,
      });
    }
    return series;
  } catch (err) {
    console.error("[weather-summary] met.no fetch failed", err);
    return null;
  }
}

type SunTimes = { sunrise: string | null; sunset: string | null };
async function fetchSun(lat: number, lon: number, date: string): Promise<SunTimes> {
  try {
    const url = `https://api.met.no/weatherapi/sunrise/3.0/sun?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&date=${date}&offset=+01:00`;
    const res = await loggedFetch("met", "sunrise", url, {
      headers: { "User-Agent": "riis.cc weather-summary push (agenda@riis.cc)" },
    });
    if (!res.ok) return { sunrise: null, sunset: null };
    const json = (await res.json()) as {
      properties?: { sunrise?: { time?: string }; sunset?: { time?: string } };
    };
    return {
      sunrise: json.properties?.sunrise?.time ?? null,
      sunset: json.properties?.sunset?.time ?? null,
    };
  } catch {
    return { sunrise: null, sunset: null };
  }
}

async function fetchUv(lat: number, lon: number, date: string): Promise<number | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&daily=uv_index_max&timezone=Europe%2FOslo&start_date=${date}&end_date=${date}`;
    const res = await loggedFetch("open-meteo", "uv-index-max", url, {});
    if (!res.ok) return null;
    const json = (await res.json()) as { daily?: { uv_index_max?: number[] } };
    const v = json.daily?.uv_index_max?.[0];
    return typeof v === "number" ? v : null;
  } catch {
    return null;
  }
}

const NB_DAY = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];

function targetDateForSlot(target: SummaryTarget): string {
  const base = new Date();
  if (target === "tomorrow") base.setTime(base.getTime() + 24 * 3600 * 1000);
  return osloDateString(base);
}

function symbolToEmoji(sym: string | null): string {
  if (!sym) return "🌤";
  const s = sym.toLowerCase();
  if (s.includes("thunder")) return "⛈";
  if (s.includes("snow")) return "❄️";
  if (s.includes("sleet")) return "🌨";
  if (s.includes("rain") || s.includes("showers")) return "🌧";
  if (s.includes("fog")) return "🌫";
  if (s.includes("cloudy") && !s.includes("partly")) return "☁️";
  if (s.includes("partlycloudy") || s.includes("fair")) return "⛅";
  if (s.includes("clear")) return "☀️";
  return "🌤";
}

function symbolTextNo(sym: string | null): string {
  if (!sym) return "vekslende";
  const s = sym.toLowerCase();
  if (s.includes("thunder")) return "torden";
  if (s.includes("heavysnow")) return "kraftig snø";
  if (s.includes("snow")) return "snø";
  if (s.includes("sleet")) return "sludd";
  if (s.includes("heavyrain")) return "kraftig regn";
  if (s.includes("rain") || s.includes("showers")) return "regn";
  if (s.includes("fog")) return "tåke";
  if (s.includes("cloudy") && !s.includes("partly")) return "skyet";
  if (s.includes("partlycloudy")) return "delvis skyet";
  if (s.includes("fair")) return "lettskyet";
  if (s.includes("clear")) return "klart";
  return "vekslende";
}

function extractDay(series: Series, dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00+01:00`).getTime() - 3600 * 1000;
  const end = new Date(`${dateStr}T23:59:59+01:00`).getTime() + 3600 * 1000;
  const entries = series.filter((e) => {
    const t = new Date(e.time).getTime();
    return t >= start && t <= end;
  });
  const temps = entries.map((e) => e.temp).filter((v): v is number => v != null);
  const winds = entries.map((e) => e.windSpeed).filter((v): v is number => v != null);
  const precip = entries.reduce((sum, e) => sum + (e.precip1h ?? 0), 0);
  // Pick midday symbol (12–15) if available, else first
  const midday = entries.find((e) => {
    const h = new Date(e.time).toLocaleString("en-US", { timeZone: "Europe/Oslo", hour: "numeric", hour12: false });
    const hn = parseInt(h, 10);
    return hn >= 12 && hn <= 15;
  });
  const symbol = midday?.symbol6h || midday?.symbol1h || entries.find((e) => e.symbol6h || e.symbol1h)?.symbol6h || null;
  return {
    tempMin: temps.length ? Math.min(...temps) : null,
    tempMax: temps.length ? Math.max(...temps) : null,
    windMax: winds.length ? Math.max(...winds) : null,
    precipTotal: precip,
    symbol,
    hasData: entries.length > 0,
  };
}

export async function buildSummaryMessage(
  pref: SummaryPref,
  target: SummaryTarget,
  location: { label: string; lat: number; lon: number },
): Promise<{ title: string; body: string } | null> {
  const dateStr = targetDateForSlot(target);
  const series = await fetchForecast(location.lat, location.lon);
  if (!series) return null;
  const day = extractDay(series, dateStr);
  if (!day.hasData) return null;

  const dObj = new Date(`${dateStr}T12:00:00+01:00`);
  const dayName = NB_DAY[dObj.getDay()];
  const dayLabel = target === "today" ? `I dag (${dayName})` : `I morgen (${dayName})`;

  const parts: string[] = [];
  if (pref.include_temp_range && day.tempMin != null && day.tempMax != null) {
    parts.push(`${Math.round(day.tempMin)}° → ${Math.round(day.tempMax)}°`);
  }
  if (pref.include_precip) {
    parts.push(day.precipTotal >= 0.1 ? `${day.precipTotal.toFixed(1)} mm nedbør` : "tørt");
  }
  if (pref.include_wind && day.windMax != null) {
    parts.push(`vind ${day.windMax.toFixed(0)} m/s`);
  }
  if (pref.include_sunrise_sunset) {
    const sun = await fetchSun(location.lat, location.lon, dateStr);
    if (sun.sunrise && sun.sunset) {
      const fmt = (iso: string) => new Date(iso).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" });
      parts.push(`☀️ ${fmt(sun.sunrise)}–${fmt(sun.sunset)}`);
    }
  }
  if (pref.include_uv) {
    const uv = await fetchUv(location.lat, location.lon, dateStr);
    if (uv != null && uv > 0) parts.push(`UV ${uv.toFixed(1)}`);
  }
  if (pref.include_summary) {
    parts.push(symbolTextNo(day.symbol));
  }

  const emoji = pref.include_symbol ? `${symbolToEmoji(day.symbol)} ` : "";
  const title = `${emoji}${dayLabel} · ${location.label}`;
  const body = parts.length ? parts.join(" · ") : "Ingen tilgjengelig prognose.";
  return { title, body };
}

async function resolveLocationForWho(who: string): Promise<{ label: string; lat: number; lon: number }> {
  const { data } = await supabaseAdmin
    .from("user_location_prefs")
    .select("place_label, lat, lon, updated_at")
    .eq("who", who)
    .order("updated_at", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as any;
  if (row && typeof row.lat === "number" && typeof row.lon === "number") {
    return { label: row.place_label || FALLBACK_LOCATION.label, lat: row.lat, lon: row.lon };
  }
  return FALLBACK_LOCATION;
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
    void logPushSend({ feature: ctx.feature, recipient: ctx.recipient || sub.who || "Alle", ok: true, endpoint: sub.endpoint, title: ctx.title });
    return true;
  } catch (err) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 404 || e.statusCode === 410) {
      await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
    void logPushSend({ feature: ctx.feature, recipient: ctx.recipient || sub.who || "Alle", ok: false, endpoint: sub.endpoint, status_code: e.statusCode ?? null, error_message: e.message ?? null, title: ctx.title });
    return false;
  }
}

async function sendToWho(who: string, title: string, body: string, tag: string, feature: string): Promise<{ sent: number; errors: number }> {
  let subQuery = supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
  const orFilter = buildSubscriptionWhoOr(who);
  if (orFilter) subQuery = subQuery.or(orFilter);
  const { data: subs, error } = await subQuery;
  if (error) return { sent: 0, errors: 1 };
  const payload = JSON.stringify({ title, body, tag, url: "/var" });
  let sent = 0;
  let errors = 0;
  for (const sub of subs ?? []) {
    const ok = await sendOne(
      { endpoint: sub.endpoint as string, p256dh: sub.p256dh as string, auth: sub.auth as string, who: (sub as any).who ?? null },
      payload,
      { feature, recipient: who, title },
    );
    if (ok) sent++; else errors++;
  }
  return { sent, errors };
}

export async function processWeatherSummaryNotifications(): Promise<{
  checked: number; sent: number; errors: number; skipped: number;
}> {
  ensureConfigured();

  const today = osloDateString();
  const { h: nowH, m: nowM } = osloHM();
  const nowMin = nowH * 60 + nowM;

  const { data, error } = await supabaseAdmin
    .from("weather_summary_push_prefs" as never)
    .select("*")
    .eq("enabled", true);
  if (error) throw error;
  const prefs = (data ?? []) as unknown as SummaryPref[];

  let checked = 0, sent = 0, errors = 0, skipped = 0;

  for (const p of prefs) {
    checked++;
    const slotsToRun: { slot: Slot; hour: number; minute: number; target: SummaryTarget }[] = [];
    if (p.slot1_enabled && p.last_sent_slot1_date !== today) {
      const tMin = p.slot1_hour * 60 + p.slot1_minute;
      if (Math.abs(nowMin - tMin) <= 30) slotsToRun.push({ slot: 1, hour: p.slot1_hour, minute: p.slot1_minute, target: p.slot1_target });
    }
    if (p.slot2_enabled && p.last_sent_slot2_date !== today) {
      const tMin = p.slot2_hour * 60 + p.slot2_minute;
      if (Math.abs(nowMin - tMin) <= 30) slotsToRun.push({ slot: 2, hour: p.slot2_hour, minute: p.slot2_minute, target: p.slot2_target });
    }
    if (!slotsToRun.length) { skipped++; continue; }

    const location = await resolveLocationForWho(p.who);

    for (const s of slotsToRun) {
      const msg = await buildSummaryMessage(p, s.target, location);
      if (!msg) { errors++; continue; }
      const tag = `weather-summary-${p.id}-${s.slot}-${today}`;
      const r = await sendToWho(p.who, msg.title, msg.body, tag, "weather-summary");
      sent += r.sent;
      errors += r.errors;
      const patch = s.slot === 1
        ? { last_sent_slot1_date: today }
        : { last_sent_slot2_date: today };
      await supabaseAdmin.from("weather_summary_push_prefs" as never).update(patch as never).eq("id", p.id);
    }
  }

  return { checked, sent, errors, skipped };
}

export async function sendWeatherSummaryTest(prefId: string, slot: Slot): Promise<{
  sent: number; errors: number; recipient: string; title: string; body: string;
}> {
  ensureConfigured();
  const { data, error } = await supabaseAdmin
    .from("weather_summary_push_prefs" as never)
    .select("*")
    .eq("id", prefId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Fant ikke innstilling");
  const p = data as unknown as SummaryPref;
  const target: SummaryTarget = slot === 1 ? p.slot1_target : p.slot2_target;
  const location = await resolveLocationForWho(p.who);
  const msg = await buildSummaryMessage(p, target, location);
  if (!msg) return { sent: 0, errors: 1, recipient: p.who, title: "", body: "Ingen prognose" };
  const tag = `weather-summary-test-${p.id}-${slot}-${Date.now()}`;
  const r = await sendToWho(p.who, `🧪 ${msg.title}`, msg.body + " (test)", tag, "weather-summary-test");
  return { sent: r.sent, errors: r.errors, recipient: p.who, title: msg.title, body: msg.body };
}
