import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
const __load_api_call_log_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/server/api-call-log.server")> => import("@/server/api-call-log.server"))
  .client((): Promise<typeof import("@/server/api-call-log.server")> => Promise.resolve({} as unknown as typeof import("@/server/api-call-log.server")));
const { withApiLog } = await __load_api_call_log_server();
/**
 * Henter ferske trafikkrelaterte nyheter fra NRK distrikts-RSS for Sør-/Østlandet.
 * Filtrerer på trafikknøkkelord (stengt, ulykke, kolonne, ras, vei, E18 osv.).
 *
 * Ingen autentisering. Cache 10 min.
 */

export type NrkTrafficItem = {
  id: string;
  title: string;
  description: string;
  link: string;
  pubDate: string | null;
  district: string;
  category: "closure" | "accident" | "weather" | "roadwork" | "other";
};

const FEEDS: { url: string; district: string }[] = [
  { url: "https://www.nrk.no/vestfoldogtelemark/siste.rss", district: "Vestfold og Telemark" },
  { url: "https://www.nrk.no/innlandet/siste.rss", district: "Innlandet" },
  { url: "https://www.nrk.no/sorlandet/siste.rss", district: "Sørlandet" },
  { url: "https://www.nrk.no/ostlandssendingen/siste.rss", district: "Stor-Oslo" },
  { url: "https://www.nrk.no/ostfold/siste.rss", district: "Østfold" },
  { url: "https://www.nrk.no/buskerud/siste.rss", district: "Buskerud" },
];

const TRAFFIC_KEYWORDS = [
  "stengt", "stenger", "stengning",
  "ulykke", "kollisjon", "trafikkulykke",
  "kolonne", "kolonnekjøring",
  "ras", "skred", "jordras", "snøskred", "steinras",
  " e6 ", " e16 ", " e18 ", " e134 ", " e39 ",
  "rv 7", "rv 9", "rv 36", "rv 37", "rv 41",
  "fv ", "riksvei", "fylkesvei", "motorvei",
  "trafikk", "kø", "omkjøring",
  "tunnel", "bru ", "fjellovergang", "fjelloverganger",
  "haukeli", "hardangervidda", "imingfjell",
];

const CLOSURE_WORDS = ["stengt", "stenger", "stengning"];
const ACCIDENT_WORDS = ["ulykke", "kollisjon", "trafikkulykke"];
const WEATHER_WORDS = ["ras", "skred", "snøskred", "steinras", "kolonne", "snøstorm", "uvær"];
const ROADWORK_WORDS = ["veiarbeid", "anleggsarbeid"];

function categorize(text: string): NrkTrafficItem["category"] {
  const t = text.toLowerCase();
  if (CLOSURE_WORDS.some((w) => t.includes(w))) return "closure";
  if (ACCIDENT_WORDS.some((w) => t.includes(w))) return "accident";
  if (WEATHER_WORDS.some((w) => t.includes(w))) return "weather";
  if (ROADWORK_WORDS.some((w) => t.includes(w))) return "roadwork";
  return "other";
}

function isTrafficRelated(text: string): boolean {
  const t = " " + text.toLowerCase() + " ";
  return TRAFFIC_KEYWORDS.some((k) => t.includes(k));
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

function pickTag(xml: string, tag: string): string | null {
  // CDATA-aware
  const cdata = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i");
  const m1 = xml.match(cdata);
  if (m1) return m1[1].trim();
  const plain = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m2 = xml.match(plain);
  if (m2) return decodeEntities(m2[1]).trim();
  return null;
}

function parseItems(xml: string): Array<{
  title: string; description: string; link: string; pubDate: string | null; guid: string | null;
}> {
  const items: ReturnType<typeof parseItems> = [];
  const re = /<item\b[\s\S]*?<\/item>/gi;
  const matches = xml.match(re) ?? [];
  for (const block of matches) {
    const title = pickTag(block, "title") ?? "";
    const description = stripHtml(pickTag(block, "description") ?? "");
    const link = pickTag(block, "link") ?? "";
    const pubDate = pickTag(block, "pubDate");
    const guid = pickTag(block, "guid");
    if (title || description) {
      items.push({ title, description, link, pubDate, guid });
    }
  }
  return items;
}

type CacheEntry = { ts: number; data: NrkTrafficItem[] };
let cache: CacheEntry | null = null;
const TTL_MS = 10 * 60 * 1000;

async function fetchAll(): Promise<NrkTrafficItem[]> {
  const results = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const res = await fetch(f.url, {
        headers: {
          "User-Agent": "House-RiisPettersen/1.0 (https://arne.riis.cc)",
          Accept: "application/rss+xml, application/xml, text/xml",
        },
      });
      if (!res.ok) throw new Error(`${f.url}: ${res.status}`);
      const xml = await res.text();
      const items = parseItems(xml);
      return items
        .filter((it) => isTrafficRelated(`${it.title} ${it.description}`))
        .map<NrkTrafficItem>((it) => ({
          id: it.guid ?? it.link ?? `${f.district}-${it.title}`,
          title: it.title,
          description: it.description,
          link: it.link,
          pubDate: it.pubDate,
          district: f.district,
          category: categorize(`${it.title} ${it.description}`),
        }));
    }),
  );

  const all: NrkTrafficItem[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (r.status !== "fulfilled") {
      console.warn("NRK feed feilet:", r.reason);
      continue;
    }
    for (const it of r.value) {
      const key = it.link || it.id;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(it);
    }
  }

  // Sorter: closure > accident > weather > roadwork > other, deretter dato desc
  const rank: Record<NrkTrafficItem["category"], number> = {
    closure: 0, accident: 1, weather: 2, roadwork: 3, other: 4,
  };
  all.sort((a, b) => {
    const r = rank[a.category] - rank[b.category];
    if (r !== 0) return r;
    const ta = a.pubDate ? Date.parse(a.pubDate) : 0;
    const tb = b.pubDate ? Date.parse(b.pubDate) : 0;
    return tb - ta;
  });

  return all.slice(0, 40);
}

export const getNrkTraffic = createServerFn({ method: "GET" }).handler(
  withApiLog("nrk", "getNrkTraffic", async () => {
    const now = Date.now();
    if (cache && now - cache.ts < TTL_MS) {
      return { items: cache.data, fetchedAt: cache.ts, cached: true };
    }
    try {
      const data = await fetchAll();
      cache = { ts: now, data };
      return { items: data, fetchedAt: now, cached: false };
    } catch (err) {
      console.error("NRK traffic fetch failed:", err);
      if (cache) {
        return { items: cache.data, fetchedAt: cache.ts, cached: true, stale: true };
      }
      return { items: [], fetchedAt: now, cached: false, error: String(err) };
    }
  }),
);
