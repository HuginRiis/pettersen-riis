/**
 * Server-side: hent tømmekalender fra Norkart "Min Renovasjon"
 * (proxy: norkartrenovasjon.azurewebsites.net) for adressen lagret i
 * `garbage_address`-tabellen, og send push-varsel basert på
 * `garbage_notification_prefs`.
 *
 * Skien hører til RiG (Renovasjon i Grenland), kommunenr 4003.
 */
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordApiCall } from "@/server/api-call-log.server";

const PROXY = "https://norkartrenovasjon.azurewebsites.net/proxyserver.ashx";
const KOMTEK = "https://komteksky.norkart.no/MinRenovasjon.Api";
const APP_KEY = "AE13DEEC-804F-4615-A74E-B4FAC11F0A30";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY!;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:agenda@riis.cc";

let configured = false;
function ensureVapid() {
  if (configured) return;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) throw new Error("VAPID keys missing");
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  configured = true;
}

export type GarbageAddress = {
  id: string;
  label: string;
  address_text: string;
  kommunenr: string;
  gatenavn: string;
  gatekode: string;
  husnr: string;
};

export type Fraksjon = {
  Id: number;
  Navn: string;
  Ikon: string;
};

export type TommeEntry = {
  FraksjonId: number;
  Tommedatoer: string[]; // ISO uten timezone
};

export type Pickup = {
  fraksjonId: number;
  fraksjonNavn: string;
  date: string; // YYYY-MM-DD
  daysUntil: number;
};

export type NotificationPref = {
  id: string;
  fraksjon_id: number;
  fraksjon_navn: string;
  enabled: boolean;
  days_before: number;
  notify_hour: number;
  notify_minute: number;
  who: string;
};

// Cache i 6 timer per kommune+adresse
type CacheVal = { fraksjoner: Fraksjon[]; kalender: TommeEntry[]; ts: number };
const cache = new Map<string, CacheVal>();
const CACHE_MS = 6 * 60 * 60 * 1000;

async function fetchFromNorkart(addr: GarbageAddress): Promise<{ fraksjoner: Fraksjon[]; kalender: TommeEntry[] }> {
  const key = `${addr.kommunenr}|${addr.gatekode}|${addr.husnr}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_MS) {
    // Logg cache-hit slik at panelet i Vakttårnet ser at API-en er aktiv
    await recordApiCall({
      source: "garbage",
      endpoint: "norkart/cache",
      ok: true,
      cached: true,
      duration_ms: 0,
      metadata: { kommunenr: addr.kommunenr },
    });
    return { fraksjoner: hit.fraksjoner, kalender: hit.kalender };
  }

  const headers = {
    RenovasjonAppKey: APP_KEY,
    Kommunenr: addr.kommunenr,
  };

  // Fraksjoner
  const fUrl = `${PROXY}?server=${KOMTEK}/api/fraksjoner/`;
  const fStarted = Date.now();
  const fRes = await fetch(fUrl, { headers });
  if (!fRes.ok) {
    await recordApiCall({
      source: "garbage",
      endpoint: "norkart/fraksjoner",
      ok: false,
      status_code: fRes.status,
      duration_ms: Date.now() - fStarted,
      error_message: `HTTP ${fRes.status}`,
      metadata: { kommunenr: addr.kommunenr },
    });
    throw new Error(`Fraksjoner-API svarte ${fRes.status}`);
  }
  const fraksjoner = (await fRes.json()) as Fraksjon[];
  await recordApiCall({
    source: "garbage",
    endpoint: "norkart/fraksjoner",
    ok: true,
    status_code: fRes.status,
    duration_ms: Date.now() - fStarted,
    metadata: { kommunenr: addr.kommunenr, count: fraksjoner.length },
  });

  // Tommekalender — gatenavn må sendes med trailing space (Norkarts klient gjør det).
  const gn = `${addr.gatenavn} `;
  const tUrl =
    `${PROXY}?server=${KOMTEK}/api/tommekalender/?` +
    `kommunenr=${encodeURIComponent(addr.kommunenr)}` +
    `&gatenavn=${encodeURIComponent(gn)}` +
    `&gatekode=${encodeURIComponent(addr.gatekode)}` +
    `&husnr=${encodeURIComponent(addr.husnr)}`;
  const tStarted = Date.now();
  const tRes = await fetch(tUrl, { headers });
  if (!tRes.ok) {
    await recordApiCall({
      source: "garbage",
      endpoint: "norkart/tommekalender",
      ok: false,
      status_code: tRes.status,
      duration_ms: Date.now() - tStarted,
      error_message: `HTTP ${tRes.status}`,
      metadata: { kommunenr: addr.kommunenr, gatekode: addr.gatekode, husnr: addr.husnr },
    });
    throw new Error(`Tommekalender-API svarte ${tRes.status}`);
  }
  const kalender = (await tRes.json()) as TommeEntry[];
  await recordApiCall({
    source: "garbage",
    endpoint: "norkart/tommekalender",
    ok: true,
    status_code: tRes.status,
    duration_ms: Date.now() - tStarted,
    metadata: { kommunenr: addr.kommunenr, entries: kalender.length },
  });

  cache.set(key, { fraksjoner, kalender, ts: Date.now() });
  return { fraksjoner, kalender };
}

function todayInOslo(): { y: number; m: number; d: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

function osloLocalToUtc(y: number, m: number, d: number, hh: number, mm: number): Date {
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(naive));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const osloAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), 0);
  const offsetMs = osloAsUtc - naive;
  return new Date(naive - offsetMs);
}

function diffDaysInOslo(isoDate: string): number {
  // isoDate: YYYY-MM-DD
  const [y, m, d] = isoDate.split("-").map(Number);
  const today = todayInOslo();
  const a = Date.UTC(today.y, today.m - 1, today.d);
  const b = Date.UTC(y, m - 1, d);
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export async function getGarbageOverview(): Promise<{
  address: GarbageAddress | null;
  fraksjoner: Fraksjon[];
  pickups: Pickup[];
  prefs: NotificationPref[];
  error?: string;
}> {
  const { data: addrRow } = await supabaseAdmin
    .from("garbage_address")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: prefsRows } = await supabaseAdmin
    .from("garbage_notification_prefs")
    .select("*")
    .order("fraksjon_id", { ascending: true });

  const prefs = (prefsRows ?? []) as NotificationPref[];

  if (!addrRow) {
    return { address: null, fraksjoner: [], pickups: [], prefs };
  }

  const addr = addrRow as GarbageAddress;

  try {
    const { fraksjoner, kalender } = await fetchFromNorkart(addr);
    const fMap = new Map<number, Fraksjon>();
    for (const f of fraksjoner) fMap.set(f.Id, f);

    const horizonDays = 62; // ca. 2 måneder frem i tid
    const pickups: Pickup[] = [];
    for (const entry of kalender) {
      const f = fMap.get(entry.FraksjonId);
      const navn = f?.Navn ?? `Fraksjon ${entry.FraksjonId}`;
      for (const dt of entry.Tommedatoer) {
        const date = dt.slice(0, 10);
        const daysUntil = diffDaysInOslo(date);
        if (daysUntil < 0 || daysUntil > horizonDays) continue;
        pickups.push({
          fraksjonId: entry.FraksjonId,
          fraksjonNavn: navn,
          date,
          daysUntil,
        });
      }
    }

    pickups.sort((a, b) => (a.date === b.date ? a.fraksjonId - b.fraksjonId : a.date.localeCompare(b.date)));

    return { address: addr, fraksjoner, pickups, prefs };
  } catch (err) {
    console.error("[garbage] henting feilet", err);
    return { address: addr, fraksjoner: [], pickups: [], prefs, error: String(err) };
  }
}

export async function setGarbageAddress(input: {
  address_text: string;
  kommunenr: string;
  gatenavn: string;
  gatekode: string;
  husnr: string;
  label?: string;
}) {
  cache.clear();
  const { data: existing } = await supabaseAdmin
    .from("garbage_address")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("garbage_address")
      .update({
        address_text: input.address_text,
        kommunenr: input.kommunenr,
        gatenavn: input.gatenavn,
        gatekode: input.gatekode,
        husnr: input.husnr,
        label: input.label || "Borgen",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw error;
    return { id: existing.id };
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("garbage_address")
    .insert({
      address_text: input.address_text,
      kommunenr: input.kommunenr,
      gatenavn: input.gatenavn,
      gatekode: input.gatekode,
      husnr: input.husnr,
      label: input.label || "Borgen",
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: inserted.id };
}

export async function updateGarbagePref(input: {
  fraksjon_id: number;
  fraksjon_navn?: string;
  enabled?: boolean;
  days_before?: number;
  notify_hour?: number;
  notify_minute?: number;
}) {
  const { data: existing } = await supabaseAdmin
    .from("garbage_notification_prefs")
    .select("id, fraksjon_navn")
    .eq("fraksjon_id", input.fraksjon_id)
    .maybeSingle();

  const patch: {
    updated_at: string;
    enabled?: boolean;
    days_before?: number;
    notify_hour?: number;
    notify_minute?: number;
    fraksjon_navn?: string;
  } = { updated_at: new Date().toISOString() };
  if (typeof input.enabled === "boolean") patch.enabled = input.enabled;
  if (typeof input.days_before === "number") patch.days_before = Math.max(0, Math.min(7, input.days_before));
  if (typeof input.notify_hour === "number") patch.notify_hour = Math.max(0, Math.min(23, input.notify_hour));
  if (typeof input.notify_minute === "number") patch.notify_minute = Math.max(0, Math.min(59, input.notify_minute));
  if (typeof input.fraksjon_navn === "string") patch.fraksjon_navn = input.fraksjon_navn;

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("garbage_notification_prefs")
      .update(patch)
      .eq("id", existing.id);
    if (error) throw error;
    return { id: existing.id };
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("garbage_notification_prefs")
    .insert({
      fraksjon_id: input.fraksjon_id,
      fraksjon_navn: input.fraksjon_navn || `Fraksjon ${input.fraksjon_id}`,
      enabled: input.enabled ?? true,
      days_before: input.days_before ?? 1,
      notify_hour: input.notify_hour ?? 20,
      notify_minute: input.notify_minute ?? 0,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: inserted.id };
}

async function sendPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: string,
): Promise<{ ok: boolean; statusCode?: number }> {
  try {
    ensureVapid();
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    );
    return { ok: true };
  } catch (error) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode === 404 || err.statusCode === 410) {
      await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
    console.error("[garbage-push] feilet", err.message);
    return { ok: false, statusCode: err.statusCode };
  }
}

/**
 * Sjekk planlagte tømminger og send varsel for de hvor varseltidspunktet
 * (pickup_date - days_before, kl notify_hour:notify_minute Europe/Oslo)
 * har passert og som ikke allerede er logget i `garbage_notification_log`.
 */
export async function processGarbageNotifications(): Promise<{
  checked: number;
  sent: number;
  errors: number;
  skipped: number;
}> {
  const overview = await getGarbageOverview();
  if (!overview.address || overview.pickups.length === 0) {
    return { checked: 0, sent: 0, errors: 0, skipped: 0 };
  }

  const prefMap = new Map<number, NotificationPref>();
  for (const p of overview.prefs) prefMap.set(p.fraksjon_id, p);

  const now = new Date();
  const lookBackMin = 65; // grace-vindu (cron kjører hvert 5. min)
  let checked = 0;
  let sent = 0;
  let errors = 0;
  let skipped = 0;

  for (const pickup of overview.pickups) {
    const pref = prefMap.get(pickup.fraksjonId);
    if (!pref || !pref.enabled) continue;

    const [py, pm, pd] = pickup.date.split("-").map(Number);
    // Dato for varsel = pickup-date minus days_before
    const notifyDateUtc = new Date(Date.UTC(py, pm - 1, pd) - pref.days_before * 24 * 60 * 60 * 1000);
    const notifyAt = osloLocalToUtc(
      notifyDateUtc.getUTCFullYear(),
      notifyDateUtc.getUTCMonth() + 1,
      notifyDateUtc.getUTCDate(),
      pref.notify_hour,
      pref.notify_minute,
    );

    const diffMin = (now.getTime() - notifyAt.getTime()) / 60000;
    if (diffMin < 0 || diffMin > lookBackMin) continue;

    checked++;

    // Sjekk loggen
    const { data: existing } = await supabaseAdmin
      .from("garbage_notification_log")
      .select("id")
      .eq("fraksjon_id", pickup.fraksjonId)
      .eq("pickup_date", pickup.date)
      .maybeSingle();
    if (existing?.id) {
      skipped++;
      continue;
    }

    // Hent abonnenter
    const targetWho = pref.who && pref.who !== "Alle" ? pref.who : null;
    let subQuery = supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
    if (targetWho) subQuery = subQuery.eq("who", targetWho);
    const { data: subs } = await subQuery;
    if (!subs || subs.length === 0) {
      // Marker som logget likevel for å unngå evig retry
      await supabaseAdmin.from("garbage_notification_log").insert({
        fraksjon_id: pickup.fraksjonId,
        pickup_date: pickup.date,
      });
      skipped++;
      continue;
    }

    const dayLabel =
      pref.days_before === 0
        ? "i dag"
        : pref.days_before === 1
          ? "i morgen"
          : `om ${pref.days_before} dager`;
    const dateLabel = new Date(Date.UTC(py, pm - 1, pd)).toLocaleDateString("nb-NO", {
      timeZone: "Europe/Oslo",
      weekday: "long",
      day: "numeric",
      month: "long",
    });

    const payload = JSON.stringify({
      title: `🗑 ${pickup.fraksjonNavn} hentes ${dayLabel}`,
      body: `${dateLabel} — sett ut dunken kvelden før.`,
      tag: `garbage-${pickup.fraksjonId}-${pickup.date}`,
      url: "/smarthus",
    });

    let anyOk = false;
    for (const sub of subs) {
      const r = await sendPush(
        { endpoint: sub.endpoint as string, p256dh: sub.p256dh as string, auth: sub.auth as string },
        payload,
      );
      if (r.ok) {
        sent++;
        anyOk = true;
      } else {
        errors++;
      }
    }

    if (anyOk) {
      await supabaseAdmin.from("garbage_notification_log").insert({
        fraksjon_id: pickup.fraksjonId,
        pickup_date: pickup.date,
      });
    }
  }

  return { checked, sent, errors, skipped };
}
