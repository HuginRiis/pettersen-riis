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
    fallColumn: "notified_fall_date_8" as const,
    fallEnabledColumn: "notify_fall_8" as const,
    title: (lead: number) =>
      lead <= 0 ? "☀️ Ekstrem UV nå" : `☀️ Ekstrem UV om ${lead} min — forbered deg`,
    body: (loc: string, uv: number, lead: number) =>
      `${loc}: UV når ${uv.toFixed(1)} ${leadLabel(lead)}. Unngå sol kl 12-15. Smør med SPF 50, finn klær og skygge.`,
    fallTitle: () => "🌤️ UV under 8 — ekstrem-fare over",
    fallBody: (loc: string, uv: number) =>
      `${loc}: UV er nå ${uv.toFixed(1)} (under 8). Du kan gå ut igjen, men hold SPF 30+ på.`,
  },
  {
    threshold: 6,
    column: "notified_date_6" as const,
    fallColumn: "notified_fall_date_6" as const,
    fallEnabledColumn: "notify_fall_6" as const,
    title: (lead: number) =>
      lead <= 0 ? "🧴 Sterk UV nå — styrk beskyttelsen" : `🧴 Sterk UV om ${lead} min — styrk beskyttelsen`,
    body: (loc: string, uv: number, lead: number) =>
      `${loc}: UV når ${uv.toFixed(1)} ${leadLabel(lead)}. Smør med SPF 30+, ta på solhatt og lette klær. Søk skygge midt på dagen.`,
    fallTitle: () => "🌤️ UV under 6 — du kan slappe litt av",
    fallBody: (loc: string, uv: number) =>
      `${loc}: UV er nå ${uv.toFixed(1)} (under 6). SPF 30 holder, men du trenger ikke søke skygge spesielt.`,
  },
  {
    threshold: 3,
    column: "notified_date_3" as const,
    fallColumn: "notified_fall_date_3" as const,
    fallEnabledColumn: "notify_fall_3" as const,
    title: (lead: number) => (lead <= 0 ? "🧴 På tide med solkrem" : `🧴 Solkrem om ${lead} min`),
    body: (loc: string, uv: number, lead: number) =>
      `${loc}: UV når ${uv.toFixed(1)} ${leadLabel(lead)}. Smør med SPF 30 på utsatt hud (DSA-anbefaling).`,
    fallTitle: () => "🌤️ UV under 3 — solkrem ikke nødvendig",
    fallBody: (loc: string, uv: number) =>
      `${loc}: UV er nå ${uv.toFixed(1)} (under 3). Solkrem er ikke lenger nødvendig i dag.`,
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
    const res = await loggedFetch("uv", "met:locationforecast", url, {
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
  sub: { endpoint: string; p256dh: string; auth: string; who?: string | null },
  payload: string,
  ctx: { feature: string; recipient?: string; title?: string } = { feature: "uv" },
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
    console.error("[uv-push] send error", e.statusCode, e.message);
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
    {
      const orFilter = buildSubscriptionWhoOr(targetWho);
      if (orFilter) subQuery = subQuery.or(orFilter);
    }
    const { data: subs, error: subErr } = await subQuery;
    if (subErr) {
      errors++;
      continue;
    }

    const locPrefix = (p.location ?? "").toLowerCase() === "hytta" ? "Fra hytta 🛖 · " : "Fra Tollnes 🏠 · ";
    const payload = JSON.stringify({
      title: `${locPrefix}${trigger.title(lead)}`,
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
          who: (sub as any).who ?? null,
        },
        payload,
        { feature: "uv", recipient: targetWho, title: trigger.title(lead) },
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
  {
    const orFilter = buildSubscriptionWhoOr(targetWho);
    if (orFilter) subQuery = subQuery.or(orFilter);
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
        who: (sub as any).who ?? null,
      },
      payload,
      { feature: "uv-test", recipient: targetWho, title: p.label },
    );
    if (ok) sent++;
    else errors++;
  }

  return { sent, errors, recipient: targetWho, label: p.label };
}

/**
 * Henter MET.no-prognose for hver aktiv lokasjon og finner det første
 * tidspunktet i dag (08:30-17 norsk tid) der UV passerer en terskel som ikke
 * allerede er varslet i dag. Returnerer ETA for når push faktisk vil sendes
 * (terskeltidspunkt minus lead_minutes), pluss forventet UV.
 */
export async function computeUvForecast(): Promise<
  Array<{
    id: string;
    location: string;
    label: string;
    enabled: boolean;
    leadMinutes: number;
    nextSendAt: string | null; // ISO — når push sendes
    nextThresholdAt: string | null; // ISO — når UV faktisk passerer terskel
    threshold: 3 | 6 | 8 | null;
    uv: number | null;
    reason: string;
  }>
> {
  const { data: prefs, error } = await supabaseAdmin
    .from("uv_notification_prefs" as never)
    .select("*")
    .order("location");
  if (error) throw error;

  const nowOslo = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Oslo" }));
  const today = nowOslo.toISOString().slice(0, 10);

  const out: Awaited<ReturnType<typeof computeUvForecast>> = [];

  for (const raw of (prefs ?? []) as Array<{
    id: string;
    location: string;
    label: string;
    lat: number;
    lon: number;
    enabled: boolean;
    lead_minutes: number | null;
    notified_date_3: string | null;
    notified_date_6: string | null;
    notified_date_8: string | null;
  }>) {
    const lead = typeof raw.lead_minutes === "number" ? raw.lead_minutes : LEAD_MINUTES;

    if (!raw.enabled) {
      out.push({
        id: raw.id,
        location: raw.location,
        label: raw.label,
        enabled: false,
        leadMinutes: lead,
        nextSendAt: null,
        nextThresholdAt: null,
        threshold: null,
        uv: null,
        reason: "Varsler er av",
      });
      continue;
    }

    const notified: Record<3 | 6 | 8, boolean> = {
      3: raw.notified_date_3 === today,
      6: raw.notified_date_6 === today,
      8: raw.notified_date_8 === today,
    };

    let series: Array<{ time: string; uv: number }> = [];
    try {
      const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${raw.lat}&lon=${raw.lon}`;
      const res = await loggedFetch("uv", "met:locationforecast", url, {
        headers: { "User-Agent": "riis.cc agenda push (agenda@riis.cc)" },
      });
      if (res.ok) {
        const json = (await res.json()) as {
          properties?: {
            timeseries?: Array<{
              time: string;
              data?: { instant?: { details?: { ultraviolet_index_clear_sky?: number } } };
            }>;
          };
        };
        for (const e of json.properties?.timeseries ?? []) {
          const uv = e?.data?.instant?.details?.ultraviolet_index_clear_sky;
          if (typeof uv === "number") series.push({ time: e.time, uv });
        }
      }
    } catch (err) {
      console.error("[uv-forecast] met.no fetch failed", err);
    }

    if (!series.length) {
      out.push({
        id: raw.id,
        location: raw.location,
        label: raw.label,
        enabled: true,
        leadMinutes: lead,
        nextSendAt: null,
        nextThresholdAt: null,
        threshold: null,
        uv: null,
        reason: "Mangler prognose",
      });
      continue;
    }

    // Vurder kun tidspunkter resten av dagen, innenfor 08:30-17 Oslo-tid
    const todayStart = new Date(nowOslo);
    todayStart.setHours(0, 0, 0, 0);
    const dayKey = todayStart.toISOString().slice(0, 10);

    let best: { sendAt: Date; thresholdAt: Date; threshold: 3 | 6 | 8; uv: number } | null = null;

    for (const e of series) {
      const t = new Date(e.time);
      const tOslo = new Date(t.toLocaleString("en-US", { timeZone: "Europe/Oslo" }));
      if (tOslo.toISOString().slice(0, 10) !== dayKey) continue;
      const h = tOslo.getHours();
      const m = tOslo.getMinutes();
      const inWindow = (h > 8 || (h === 8 && m >= 30)) && h <= 17;
      if (!inWindow) continue;

      for (const lvl of [8, 6, 3] as const) {
        if (notified[lvl]) continue;
        if (e.uv >= lvl) {
          const sendAt = new Date(t.getTime() - lead * 60 * 1000);
          if (sendAt.getTime() < Date.now() - 60 * 1000) continue; // allerede passert
          if (!best || sendAt < best.sendAt) {
            best = { sendAt, thresholdAt: t, threshold: lvl, uv: e.uv };
          }
          break; // ta høyeste terskel for dette tidspunktet
        }
      }
    }

    out.push({
      id: raw.id,
      location: raw.location,
      label: raw.label,
      enabled: true,
      leadMinutes: lead,
      nextSendAt: best ? best.sendAt.toISOString() : null,
      nextThresholdAt: best ? best.thresholdAt.toISOString() : null,
      threshold: best ? best.threshold : null,
      uv: best ? best.uv : null,
      reason: best ? "" : "Ingen terskel forventes nådd i dag",
    });
  }

  return out;
}

/**
 * Evaluerer UV-prognosen for de neste N dagene per aktive lokasjon.
 * For hver dag returneres maks UV (08:30-17 Oslo), første tidspunkt et
 * varsel-nivå (3/6/8) krysses, og forventet send-tid (krysningstid - lead).
 *
 * Statuser:
 *   - will-fire  : prognose viser at en terskel passeres
 *   - no-hit     : prognose finnes, men ingen terskel nås
 *   - uncertain  : ingen prognosedata for dagen ennå
 */
export async function computeUpcomingUvEvaluations(daysAhead = 3): Promise<
  Array<{
    id: string;
    location: string;
    label: string;
    recipient: string;
    leadMinutes: number;
    targetDate: string; // YYYY-MM-DD i Oslo
    notifyAt: string;   // ISO — når push planlegges sendt (eller fallback 08:00 Oslo)
    status: "will-fire" | "no-hit" | "uncertain";
    threshold: 3 | 6 | 8 | null;
    uvMax: number | null;
    uvMaxAt: string | null; // ISO
    ruleText: string;
  }>
> {
  const { data: prefs, error } = await supabaseAdmin
    .from("uv_notification_prefs" as never)
    .select("*")
    .eq("enabled", true)
    .order("location");
  if (error) throw error;

  const out: Awaited<ReturnType<typeof computeUpcomingUvEvaluations>> = [];

  // Cache prognose per lokasjon (lat,lon).
  const seriesCache = new Map<string, Array<{ time: string; uv: number }>>();

  function osloDateIso(d: Date): string {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(d);
  }
  function osloLocalToUtc(dateIso: string, hour: number, minute = 0): Date {
    const [y, m, d] = dateIso.split("-").map(Number);
    const naive = Date.UTC(y, m - 1, d, hour, minute, 0);
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Oslo",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = fmt.formatToParts(new Date(naive));
    const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
    const osloAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), 0);
    const offset = osloAsUtc - naive;
    return new Date(naive - offset);
  }

  const now = new Date();
  const todayOsloIso = osloDateIso(now);

  for (const raw of (prefs ?? []) as Array<{
    id: string;
    location: string;
    label: string;
    lat: number;
    lon: number;
    recipient: string;
    lead_minutes: number | null;
  }>) {
    const lead = typeof raw.lead_minutes === "number" ? raw.lead_minutes : LEAD_MINUTES;
    const cacheKey = `${raw.lat},${raw.lon}`;
    let series = seriesCache.get(cacheKey);
    if (!series) {
      series = [];
      try {
        const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${raw.lat}&lon=${raw.lon}`;
        const res = await loggedFetch("uv", "met:locationforecast", url, {
          headers: { "User-Agent": "riis.cc agenda push (agenda@riis.cc)" },
        });
        if (res.ok) {
          const json = (await res.json()) as {
            properties?: {
              timeseries?: Array<{
                time: string;
                data?: { instant?: { details?: { ultraviolet_index_clear_sky?: number } } };
              }>;
            };
          };
          for (const e of json.properties?.timeseries ?? []) {
            const uv = e?.data?.instant?.details?.ultraviolet_index_clear_sky;
            if (typeof uv === "number") series.push({ time: e.time, uv });
          }
        }
      } catch (err) {
        console.error("[uv-upcoming] met.no fetch failed", err);
      }
      seriesCache.set(cacheKey, series);
    }

    for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
      const target = new Date(now.getTime() + dayOffset * 86400000);
      const targetIso = osloDateIso(target);

      // Filtrer punkter på denne dagen i Oslo-tid, vindu 08:30-17.
      const dayPoints = series.filter((e) => {
        const t = new Date(e.time);
        const iso = osloDateIso(t);
        if (iso !== targetIso) return false;
        const oslo = new Date(t.toLocaleString("en-US", { timeZone: "Europe/Oslo" }));
        const h = oslo.getHours();
        const m = oslo.getMinutes();
        return (h > 8 || (h === 8 && m >= 30)) && h <= 17;
      });

      if (dayPoints.length === 0) {
        // Ingen prognose ennå (typisk dag 7+ for met.no)
        const fallback = osloLocalToUtc(targetIso, 8, 0);
        out.push({
          id: `${raw.id}-${targetIso}`,
          location: raw.location,
          label: raw.label,
          recipient: raw.recipient,
          leadMinutes: lead,
          targetDate: targetIso,
          notifyAt: fallback.toISOString(),
          status: "uncertain",
          threshold: null,
          uvMax: null,
          uvMaxAt: null,
          ruleText: "Sender hvis UV ≥ 3 (sjekk kl 08-17)",
        });
        continue;
      }

      // Maks UV i vinduet
      let maxPoint = dayPoints[0];
      for (const p of dayPoints) if (p.uv > maxPoint.uv) maxPoint = p;

      // Første tidspunkt der nivå krysses (høyeste først)
      let crossing: { lvl: 3 | 6 | 8; at: Date; uv: number } | null = null;
      for (const lvl of [8, 6, 3] as const) {
        const hit = dayPoints.find((p) => p.uv >= lvl);
        if (hit) {
          const at = new Date(hit.time);
          if (!crossing || at.getTime() < (crossing as { at: Date }).at.getTime()) {
            crossing = { lvl, at, uv: hit.uv };
          }
          break;
        }
      }

      if (!crossing) {
        // Ingen terskel nådd — drop "i dag" (allerede sjekket), vis ellers no-hit
        if (targetIso === todayOsloIso) continue;
        const fallback = osloLocalToUtc(targetIso, 8, 0);
        out.push({
          id: `${raw.id}-${targetIso}`,
          location: raw.location,
          label: raw.label,
          recipient: raw.recipient,
          leadMinutes: lead,
          targetDate: targetIso,
          notifyAt: fallback.toISOString(),
          status: "no-hit",
          threshold: null,
          uvMax: maxPoint.uv,
          uvMaxAt: maxPoint.time,
          ruleText: `Maks UV ${maxPoint.uv.toFixed(1)} — under terskel 3`,
        });
        continue;
      }

      const sendAt = new Date(crossing.at.getTime() - lead * 60 * 1000);
      // For "i dag": ikke vis hvis sending allerede er passert
      if (targetIso === todayOsloIso && sendAt.getTime() < now.getTime() - 60 * 1000) continue;

      out.push({
        id: `${raw.id}-${targetIso}`,
        location: raw.location,
        label: raw.label,
        recipient: raw.recipient,
        leadMinutes: lead,
        targetDate: targetIso,
        notifyAt: sendAt.toISOString(),
        status: "will-fire",
        threshold: crossing.lvl,
        uvMax: maxPoint.uv,
        uvMaxAt: maxPoint.time,
        ruleText: `UV ≥ ${crossing.lvl} (maks ${maxPoint.uv.toFixed(1)})`,
      });
    }
  }

  return out;
}
