/**
 * Push-varslinger for fly i nærheten av Tollnes / Hytta.
 */
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logPushSend } from "./push-log.server";
import { buildSubscriptionWhoOr } from "./push-recipients";
import {
  getNearbyFlights,
  FLIGHT_LOCATIONS,
  type Flight,
  type FlightPushSettings,
  type FlightLocationId,
} from "./flights.functions";
import { translateAircraftType, registrationCountry, explainSquawk, translateAirline } from "./flight-translations";

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

function compass(deg: number): string {
  const dirs = ["N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV"];
  return dirs[Math.round(deg / 45) % 8];
}

function formatFlight(
  f: Flight,
  locationLabel: string,
  fields: FlightPushSettings["fields"],
): { title: string; body: string } {
  const cs = f.callsign || f.icao24.toUpperCase();
  const set = new Set(fields);
  // Title: callsign (+ origin land hvis valgt)
  const origin = set.has("origin") && f.originCountry ? ` (${f.originCountry})` : "";
  const title = `✈️ ${cs}${origin}`;

  const parts: string[] = [];
  if (set.has("distance")) parts.push(`${f.distanceKm.toFixed(1)} km fra ${locationLabel}`);
  if (set.has("direction") && f.trueTrack != null) parts.push(`mot ${compass(f.trueTrack)}`);
  if (set.has("altitude") && f.baroAltitudeM != null) parts.push(`${(f.baroAltitudeM / 1000).toFixed(1)} km høyde`);
  if (set.has("speed") && f.velocityMs != null) parts.push(`${Math.round(f.velocityMs * 3.6)} km/t`);
  if (set.has("verticalRate") && f.verticalRateMs != null) {
    const fpm = Math.round(f.verticalRateMs * 196.85);
    parts.push(`${fpm > 0 ? "↑" : fpm < 0 ? "↓" : "→"}${Math.abs(fpm)} ft/min`);
  }
  if (set.has("registration") && f.registration) parts.push(f.registration);
  if (set.has("registrationCountry")) {
    const c = registrationCountry(f.registration);
    if (c) parts.push(`reg: ${c}`);
  }
  if (set.has("type") && f.aircraftType) parts.push(f.aircraftType);
  if (set.has("typeFriendly")) {
    const t = translateAircraftType(f.aircraftType);
    if (t) parts.push(t);
  }
  if (set.has("description") && f.description) parts.push(f.description);
  if (set.has("operator") && f.operator) parts.push(f.operator);
  if (set.has("squawk") && f.squawk) parts.push(`sq ${f.squawk}`);
  if (set.has("squawkExplained")) {
    const e = explainSquawk(f.squawk);
    if (e) parts.push(e);
  }
  if (set.has("category") && f.category) parts.push(f.category);
  if (set.has("emergency") && f.emergency && f.emergency !== "none") parts.push(`⚠ ${f.emergency}`);

  return { title, body: parts.join(" · ") };
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
      feature: "flight",
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
      feature: "flight",
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

async function pushToRecipient(
  recipient: string,
  payload: string,
  title: string,
): Promise<{ sent: number; errors: number }> {
  let q = supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
  const or = buildSubscriptionWhoOr(recipient);
  if (or) q = q.or(or);
  const { data: subs } = await q;
  let sent = 0, errors = 0;
  for (const s of subs ?? []) {
    const ok = await sendOne(
      { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, who: (s as any).who ?? null },
      payload,
      { recipient, title },
    );
    if (ok) sent++; else errors++;
  }
  return { sent, errors };
}

async function processForLocation(loc: FlightLocationId): Promise<{
  checked: number;
  sent: number;
  errors: number;
  skipped: number;
}> {
  const meta = FLIGHT_LOCATIONS[loc];
  const { data: cfgRow } = await supabaseAdmin
    .from("notification_settings")
    .select("value")
    .eq("key", meta.settingsKey)
    .maybeSingle();
  const cfg = (cfgRow?.value ?? null) as Partial<FlightPushSettings> | null;
  if (!cfg?.enabled) return { checked: 0, sent: 0, errors: 0, skipped: 1 };

  const maxDist = cfg.maxDistanceKm ?? 25;
  const maxAlt = cfg.maxAltitudeM ?? 5000;
  const cooldownMin = cfg.cooldownMinutes ?? 60;
  const recipient = cfg.recipient || "Alle";

  const r = await getNearbyFlights({ data: { location: loc } });
  if (!r.ok) return { checked: 0, sent: 0, errors: 1, skipped: 0 };

  const candidates = r.flights.filter((f) => {
    if (f.distanceKm > maxDist) return false;
    if (maxAlt > 0 && f.baroAltitudeM != null && f.baroAltitudeM > maxAlt) return false;
    return true;
  });
  if (candidates.length === 0) return { checked: 0, sent: 0, errors: 0, skipped: 0 };

  const icaos = candidates.map((c) => c.icao24);
  const { data: seenRows } = await supabaseAdmin
    .from("flights_seen")
    .select("icao24, last_notified_at")
    .eq("location", loc)
    .in("icao24", icaos);
  const lastNotified = new Map<string, string | null>();
  for (const row of (seenRows ?? []) as Array<{ icao24: string; last_notified_at: string | null }>) {
    lastNotified.set(row.icao24, row.last_notified_at);
  }

  const cooldownMs = cooldownMin * 60_000;
  const now = Date.now();
  let sent = 0, errors = 0, skipped = 0;

  for (const f of candidates) {
    const last = lastNotified.get(f.icao24);
    if (last && now - new Date(last).getTime() < cooldownMs) {
      skipped++;
      continue;
    }
    const { title, body } = formatFlight(f, meta.label, cfg.fields ?? []);
    const payload = JSON.stringify({
      title,
      body,
      tag: `flight-${loc}-${f.icao24}`,
      url: "/fly",
    });
    const res = await pushToRecipient(recipient, payload, title);
    sent += res.sent;
    errors += res.errors;

    await supabaseAdmin
      .from("flights_seen")
      .upsert(
        {
          location: loc,
          icao24: f.icao24,
          callsign: f.callsign,
          origin_country: f.originCountry,
          last_seen: new Date().toISOString(),
          last_notified_at: new Date().toISOString(),
          last_notified_distance_km: f.distanceKm,
        } as any,
        { onConflict: "location,icao24" },
      );
  }

  return { checked: candidates.length, sent, errors, skipped };
}

export async function processFlightNotifications(): Promise<{
  checked: number;
  sent: number;
  errors: number;
  skipped: number;
}> {
  ensureConfigured();
  const locs: FlightLocationId[] = ["tollnes", "hytta"];
  let checked = 0, sent = 0, errors = 0, skipped = 0;
  for (const l of locs) {
    const r = await processForLocation(l);
    checked += r.checked; sent += r.sent; errors += r.errors; skipped += r.skipped;
  }
  return { checked, sent, errors, skipped };
}

export async function sendManualFlightPush(
  icao24: string,
  recipient: string,
  location: FlightLocationId = "tollnes",
): Promise<{ sent: number; errors: number; message: string }> {
  ensureConfigured();
  const meta = FLIGHT_LOCATIONS[location];
  const r = await getNearbyFlights({ data: { location } });
  if (!r.ok) return { sent: 0, errors: 1, message: r.error };
  const flight = r.flights.find((f) => f.icao24.toLowerCase() === icao24.toLowerCase());
  if (!flight) return { sent: 0, errors: 0, message: "Fant ikke flyet i live-data lenger" };
  const { data: cfgRow } = await supabaseAdmin
    .from("notification_settings")
    .select("value")
    .eq("key", meta.settingsKey)
    .maybeSingle();
  const cfg = (cfgRow?.value ?? null) as Partial<FlightPushSettings> | null;
  const fields = (cfg?.fields && cfg.fields.length
    ? cfg.fields
    : ["distance", "direction", "altitude", "speed", "origin", "registration", "type", "operator"]) as FlightPushSettings["fields"];
  const { title, body } = formatFlight(flight, meta.label, fields);
  const payload = JSON.stringify({
    title,
    body,
    tag: `flight-manual-${location}-${flight.icao24}-${Date.now()}`,
    url: "/fly",
  });
  const res = await pushToRecipient(recipient || "Alle", payload, title);
  return { ...res, message: `${title} — ${body}` };
}
