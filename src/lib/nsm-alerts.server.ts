/**
 * Henter NSM-varsler fra https://nsm.no/.../varsler-fra-nsm/ ved å parse HTML.
 * Lagrer i public.nsm_alerts, sender push for nye via processNsmNotifications().
 */
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logPushSend } from "./push-log.server";
import { buildSubscriptionWhoOr } from "./push-recipients";

const NSM_LIST_URL =
  "https://nsm.no/fagomrader/digital-sikkerhet/nasjonalt-cybersikkerhetssenter/varsler-fra-nsm/";
const NSM_ORIGIN = "https://nsm.no";

const MONTHS_NB: Record<string, number> = {
  januar: 0, februar: 1, mars: 2, april: 3, mai: 4, juni: 5,
  juli: 6, august: 7, september: 8, oktober: 9, november: 10, desember: 11,
};

export type NsmAlertRaw = {
  external_id: string;
  title: string;
  summary: string | null;
  url: string;
  published_at: string | null;
};

function parseNorwegianDate(s: string): string | null {
  const m = s.toLowerCase().match(/(\d{1,2})\s+([a-zæøå]+)\s+(\d{4})/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS_NB[m[2]];
  const year = Number(m[3]);
  if (month === undefined) return null;
  const d = new Date(Date.UTC(year, month, day, 8, 0, 0));
  return d.toISOString();
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parser NSM-listingssiden. Strukturen er en liste der hvert varsel har
 * en lenke til varselsiden + dato + tittel + kort sammendrag.
 */
export function parseNsmList(html: string): NsmAlertRaw[] {
  const results: NsmAlertRaw[] = [];
  const seen = new Set<string>();

  // Finn alle lenker som peker til underartikler av varsler-fra-nsm.
  // Pattern: href="...varsler-fra-nsm/<slug>" der slug ikke inneholder "?" eller "#main-content".
  const linkRe =
    /<a[^>]+href="([^"#?]*\/varsler-fra-nsm\/[a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const rawHref = m[1];
    const inner = m[2];
    // hopp over rene paginerings-/arkiv-lenker (de har "?span=")
    if (rawHref.includes("?")) continue;

    const url = rawHref.startsWith("http") ? rawHref : NSM_ORIGIN + rawHref;
    const slug = url.split("/").filter(Boolean).pop() || url;
    if (seen.has(slug)) continue;

    const text = stripTags(inner);
    if (!text) continue;

    // Format: "9 juni 2026 Microsoft patchetirsdag juni  <sammendrag...>"
    const dateMatch = text.match(/^(\d{1,2}\s+[a-zæøå]+\s+\d{4})\s+(.+)$/i);
    let publishedISO: string | null = null;
    let titleAndBody = text;
    if (dateMatch) {
      publishedISO = parseNorwegianDate(dateMatch[1]);
      titleAndBody = dateMatch[2].trim();
    }
    if (!titleAndBody) continue;

    // Tittelen er typisk første "setning" før et linjeskift eller punktum
    // etterfulgt av mellomrom og stor bokstav. I lenketeksten skilles tittel
    // og sammendrag ofte med doble mellomrom som vi normaliserte. Heuristikk:
    // del ved første punktum hvis sammendrag finnes, ellers er hele = tittel.
    let title = titleAndBody;
    let summary: string | null = null;
    const dotIdx = titleAndBody.search(/\.\s+[A-ZÆØÅa-zæøå0-9]/);
    if (dotIdx > 10 && dotIdx < 160) {
      title = titleAndBody.slice(0, dotIdx).trim();
      summary = titleAndBody.slice(dotIdx + 1).trim();
    } else if (titleAndBody.length > 120) {
      // forsøk å splitte på mellomrom rundt char 90 hvis det ikke er punktum
      const sp = titleAndBody.indexOf(" ", 90);
      if (sp > 0 && sp < 140) {
        title = titleAndBody.slice(0, sp).trim();
        summary = titleAndBody.slice(sp + 1).trim();
      }
    }

    seen.add(slug);
    results.push({
      external_id: slug,
      title,
      summary,
      url,
      published_at: publishedISO,
    });
  }

  // Sorter nyest først (de uten dato havner sist)
  results.sort((a, b) => {
    const ta = a.published_at ? Date.parse(a.published_at) : 0;
    const tb = b.published_at ? Date.parse(b.published_at) : 0;
    return tb - ta;
  });

  return results;
}

export async function fetchNsmList(): Promise<NsmAlertRaw[]> {
  const res = await fetch(NSM_LIST_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; HousePettersenRiisBot/1.0; +https://pettersen-riis.lovable.app)",
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`NSM listing ${res.status}`);
  const html = await res.text();
  return parseNsmList(html);
}

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

type Sub = { endpoint: string; p256dh: string; auth: string; who?: string | null };

async function sendOne(sub: Sub, payload: string, ctx: { recipient: string; title: string }): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    );
    void logPushSend({ feature: "nsm", recipient: ctx.recipient || sub.who || "Alle", ok: true, endpoint: sub.endpoint, title: ctx.title });
    return true;
  } catch (err) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 404 || e.statusCode === 410) {
      await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
    void logPushSend({ feature: "nsm", recipient: ctx.recipient, ok: false, endpoint: sub.endpoint, status_code: e.statusCode ?? null, error_message: e.message ?? null, title: ctx.title });
    return false;
  }
}

export async function pollAndStoreNsm(): Promise<{
  fetched: number;
  inserted: number;
  newIds: string[];
}> {
  const list = await fetchNsmList();
  if (list.length === 0) return { fetched: 0, inserted: 0, newIds: [] };

  // Hent eksisterende eksterne IDer
  const ids = list.map((a) => a.external_id);
  const { data: existing } = await supabaseAdmin
    .from("nsm_alerts" as never)
    .select("external_id")
    .in("external_id", ids);
  const existingSet = new Set((existing ?? []).map((r: { external_id: string }) => r.external_id));

  const toInsert = list.filter((a) => !existingSet.has(a.external_id));
  let inserted = 0;
  if (toInsert.length > 0) {
    const rows = toInsert.map((a) => ({
      external_id: a.external_id,
      title: a.title,
      summary: a.summary,
      url: a.url,
      published_at: a.published_at,
      notified: false,
    }));
    const { error } = await supabaseAdmin.from("nsm_alerts" as never).insert(rows as never);
    if (!error) inserted = rows.length;
  }

  return { fetched: list.length, inserted, newIds: toInsert.map((a) => a.external_id) };
}

export async function processNsmNotifications(): Promise<{ checked: number; sent: number; errors: number }> {
  // Finn varslede ikke ennå pushede
  const { data: pending } = await supabaseAdmin
    .from("nsm_alerts" as never)
    .select("id, external_id, title, summary, url, published_at")
    .eq("notified", false)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(20);
  const alerts = (pending ?? []) as Array<{
    id: string; external_id: string; title: string; summary: string | null; url: string; published_at: string | null;
  }>;
  if (alerts.length === 0) return { checked: 0, sent: 0, errors: 0 };

  const { data: prefsRaw } = await supabaseAdmin
    .from("nsm_notification_prefs" as never)
    .select("*")
    .eq("enabled", true);
  const prefs = (prefsRaw ?? []) as Array<{ id: string; recipient: string; enabled: boolean }>;
  if (prefs.length === 0) {
    // marker som notified uansett for å unngå backlog når noen senere skrur på
    await supabaseAdmin
      .from("nsm_alerts" as never)
      .update({ notified: true } as never)
      .in("id", alerts.map((a) => a.id));
    return { checked: alerts.length, sent: 0, errors: 0 };
  }

  ensureConfigured();
  let sent = 0;
  let errors = 0;

  for (const pref of prefs) {
    const targetWho = pref.recipient || "Alle";
    let subQuery = supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
    const orFilter = buildSubscriptionWhoOr(targetWho);
    if (orFilter) subQuery = subQuery.or(orFilter);
    const { data: subs } = await subQuery;
    if (!subs || subs.length === 0) continue;

    for (const a of alerts) {
      const title = `🛡️ NSM: ${a.title}`.slice(0, 120);
      const body = (a.summary ?? "Nytt cybersikkerhetsvarsel fra NSM").slice(0, 240);
      const payload = JSON.stringify({
        title,
        body,
        tag: `nsm-${a.external_id}`,
        url: "/nsm-sikkerhet",
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
          { recipient: targetWho, title },
        );
        if (ok) sent++; else errors++;
      }
    }
  }

  // Marker alle som notified
  await supabaseAdmin
    .from("nsm_alerts" as never)
    .update({ notified: true } as never)
    .in("id", alerts.map((a) => a.id));

  return { checked: alerts.length, sent, errors };
}

export async function sendNsmTestPush(recipient: string): Promise<{ sent: number; errors: number }> {
  ensureConfigured();
  let subQuery = supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
  const orFilter = buildSubscriptionWhoOr(recipient);
  if (orFilter) subQuery = subQuery.or(orFilter);
  const { data: subs } = await subQuery;
  const payload = JSON.stringify({
    title: "🧪 TEST: NSM Sikkerhet",
    body: `Push for ${recipient} fungerer. Du vil få varsler om nye NSM-cyberhendelser.`,
    tag: `nsm-test-${Date.now()}`,
    url: "/nsm-sikkerhet",
  });
  let sent = 0;
  let errors = 0;
  for (const sub of subs ?? []) {
    const ok = await sendOne(
      {
        endpoint: sub.endpoint as string,
        p256dh: sub.p256dh as string,
        auth: sub.auth as string,
        who: (sub as { who?: string | null }).who ?? null,
      },
      payload,
      { recipient, title: "TEST NSM" },
    );
    if (ok) sent++; else errors++;
  }
  return { sent, errors };
}
