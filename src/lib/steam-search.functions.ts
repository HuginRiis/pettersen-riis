// Søk i Steam-katalogen (alle Windows-spill gjennom tidene) via Steams offentlige store-API.
// aiSteamSearch bruker Lovable AI til å gjøre et naturlig søk om til gode Steam-søkeord,
// og til å anslå antall spillere / hvorfor spillet passer.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createIsomorphicFn as __claudeIso } from "@tanstack/react-start";
// Lovable AI → Claude (selvhostet): avskjæreren lastes bare på serveren.
await __claudeIso().server(() => import("@/lib/claude-gateway.server")).client(() => Promise.resolve({}))();

export type SteamGame = {
  appid: number;
  name: string;
  image: string;
  price: string | null;
  metascore: string | null;
  windows: boolean;
  genres: string[];
  categories: string[];
  coop: boolean;
  lan: boolean;
  multiplayer: boolean;
  maxPlayersHint: number | null;
  playersLabel?: string | null;
  aiNote?: string | null;
  releaseYear: number | null;
  url: string;
};

type StoreSearchItem = {
  id: number;
  name: string;
  tiny_image?: string;
  metascore?: string;
  price?: { final?: number; currency?: string };
  platforms?: { windows?: boolean };
};

async function storeSearch(term: string): Promise<StoreSearchItem[]> {
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&cc=no&l=english`,
      { headers: { "User-Agent": "Mozilla/5.0" } },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { items?: StoreSearchItem[] };
    return json.items ?? [];
  } catch {
    return [];
  }
}

async function appDetails(it: StoreSearchItem): Promise<SteamGame> {
  const base: SteamGame = {
    appid: it.id,
    name: it.name,
    image: it.tiny_image ?? "",
    price:
      it.price?.final != null
        ? `${(it.price.final / 100).toFixed(0)} ${it.price.currency ?? "NOK"}`
        : null,
    metascore: it.metascore || null,
    windows: it.platforms?.windows !== false,
    genres: [],
    categories: [],
    coop: false,
    lan: false,
    multiplayer: false,
    maxPlayersHint: null,
    playersLabel: null,
    aiNote: null,
    releaseYear: null,
    url: `https://store.steampowered.com/app/${it.id}/`,
  };
  try {
    const dRes = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${it.id}&cc=no&l=english`,
      { headers: { "User-Agent": "Mozilla/5.0" } },
    );
    if (!dRes.ok) return base;
    const dJson = (await dRes.json()) as Record<
      string,
      {
        data?: {
          genres?: { description: string }[];
          categories?: { description: string }[];
          platforms?: { windows?: boolean };
          release_date?: { date?: string };
          header_image?: string;
        };
      }
    >;
    const d = dJson[String(it.id)]?.data;
    if (!d) return base;
    const genres = (d.genres ?? []).map((g) => g.description);
    const categories = (d.categories ?? []).map((c) => c.description);
    const lc = categories.map((c) => c.toLowerCase());
    const yearMatch = d.release_date?.date?.match(/(19|20)\d{2}/);
    return {
      ...base,
      image: d.header_image ?? base.image,
      windows: d.platforms?.windows !== false,
      genres,
      categories,
      coop: lc.some((c) => c.includes("co-op") || c.includes("remote play together")),
      lan: lc.some((c) => c.includes("lan")),
      multiplayer: lc.some((c) => c.includes("multi-player") || c.includes("pvp")),
      releaseYear: yearMatch ? Number(yearMatch[0]) : null,
    };
  } catch {
    return base;
  }
}

export const searchSteamGames = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ term: z.string().min(2).max(80) }).parse(data))
  .handler(async ({ data }): Promise<{ games: SteamGame[]; error?: string }> => {
    const items = (await storeSearch(data.term)).slice(0, 12);
    const games = await Promise.all(items.map(appDetails));
    return { games };
  });

const CATEGORY_HINT: Record<string, string> = {
  racing: "bilspill / racing",
  sim: "simulator",
  shooter: "skytespill / FPS",
  strategy: "strategi",
  sport: "sportsspill",
  rpg: "rollespill",
  adventure: "eventyr",
  indie: "indie / casual",
};

async function askAi(apiKey: string, system: string, user: string): Promise<any | null> {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return null;
  }
}

export const aiSteamSearch = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        query: z.string().min(2).max(300),
        players: z.number().int().min(1).max(64).optional(),
        categories: z.array(z.string().max(30)).max(10).optional(),
        coopOnly: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(
    async ({
      data,
    }): Promise<{ games: SteamGame[]; terms: string[]; summary: string; error?: string }> => {
      const apiKey = process.env.LOVABLE_API_KEY;
      const catText = (data.categories ?? [])
        .map((c) => CATEGORY_HINT[c] ?? c)
        .join(", ");

      let terms: string[] = [];
      let summary = "";

      if (apiKey) {
        const plan = await askAi(
          apiKey,
          `Du hjelper med å finne PC-spill på Steam til en LAN-tur. Du får et norsk ønske, ønsket antall spillere og evt. kategorier.
Returner JSON: {"terms": ["engelske søkeord som funker i Steam-butikkens søk", ...], "summary": "kort norsk setning om hva du leter etter"}.
Gi 4-6 korte, konkrete engelske søkeord/titler (spillnavn eller sjanger-ord). Ikke lange setninger.`,
          `Ønske: ${data.query}\nAntall spillere: ${data.players ?? "ukjent"}\nKategorier: ${catText || "ingen"}\nKun co-op/LAN: ${data.coopOnly ? "ja" : "nei"}`,
        );
        if (plan && Array.isArray(plan.terms)) {
          terms = plan.terms.map((t: unknown) => String(t)).filter(Boolean).slice(0, 6);
          summary = typeof plan.summary === "string" ? plan.summary : "";
        }
      }
      if (terms.length === 0) terms = [data.query];

      // Hent kandidater fra Steam
      const lists = await Promise.all(terms.map((t) => storeSearch(t)));
      const seen = new Set<number>();
      const candidates: StoreSearchItem[] = [];
      const maxPerTerm = 5;
      lists.forEach((list) => {
        list.slice(0, maxPerTerm).forEach((it) => {
          if (!seen.has(it.id)) {
            seen.add(it.id);
            candidates.push(it);
          }
        });
      });

      let games = await Promise.all(candidates.slice(0, 18).map(appDetails));
      games = games.filter((g) => g.windows);
      if (data.coopOnly) games = games.filter((g) => g.coop || g.lan || g.multiplayer);

      // AI-pass 2: antall spillere + kort begrunnelse + rangering
      if (apiKey && games.length > 0) {
        const listText = games
          .map(
            (g) =>
              `${g.appid} | ${g.name} | sjanger: ${g.genres.join("/") || "?"} | kategorier: ${g.categories.slice(0, 8).join("/")}`,
          )
          .join("\n");
        const rank = await askAi(
          apiKey,
          `Du vurderer Steam-spill til en LAN-tur. Returner JSON:
{"games": [{"appid": 123, "players": "2-8", "note": "kort norsk begrunnelse (maks 12 ord)", "score": 0-100}]}
Sorter etter hvor godt de passer ønsket. Ta med maks 12. "players" = typisk antall spillere i flerspiller.`,
          `Ønske: ${data.query}\nØnsket antall spillere: ${data.players ?? "ukjent"}\nKategorier: ${catText || "ingen"}\n\nKandidater:\n${listText}`,
        );
        const arr = rank && Array.isArray(rank.games) ? rank.games : [];
        if (arr.length > 0) {
          const meta = new Map<number, { players?: string; note?: string; score?: number }>();
          arr.forEach((r: any) => {
            const id = Number(r?.appid);
            if (Number.isFinite(id))
              meta.set(id, {
                players: r?.players ? String(r.players) : undefined,
                note: r?.note ? String(r.note) : undefined,
                score: Number(r?.score) || 0,
              });
          });
          games = games
            .filter((g) => meta.has(g.appid))
            .map((g) => ({
              ...g,
              playersLabel: meta.get(g.appid)?.players ?? null,
              aiNote: meta.get(g.appid)?.note ?? null,
            }))
            .sort((a, b) => (meta.get(b.appid)?.score ?? 0) - (meta.get(a.appid)?.score ?? 0));
        }
      }

      return { games: games.slice(0, 12), terms, summary };
    },
  );

// De nyeste LAN-/flerspillervennlige Steam-slippene. Brukes som daglig forslagsliste.
export const newestLanGames = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ games: SteamGame[]; fetchedAt: string }> => {
    let items: StoreSearchItem[] = [];
    try {
      const res = await fetch(
        "https://store.steampowered.com/api/featuredcategories?cc=no&l=english",
        { headers: { "User-Agent": "Mozilla/5.0" } },
      );
      if (res.ok) {
        const json = (await res.json()) as Record<string, { items?: any[] }>;
        const raw = [
          ...(json["new_releases"]?.items ?? []),
          ...(json["top_sellers"]?.items ?? []),
        ];
        const seen = new Set<number>();
        for (const r of raw) {
          const id = Number(r?.id);
          if (!Number.isFinite(id) || seen.has(id)) continue;
          seen.add(id);
          items.push({
            id,
            name: String(r?.name ?? ""),
            tiny_image: r?.header_image ?? r?.small_capsule_image,
            price: r?.final_price != null ? { final: r.final_price, currency: r.currency } : undefined,
            platforms: { windows: r?.windows_available !== false },
          });
        }
      }
    } catch {
      items = [];
    }

    const detailed = await Promise.all(items.slice(0, 40).map(appDetails));
    const playable = detailed.filter((g) => g.windows);
    const lanFirst = playable.filter((g) => g.lan || g.coop || g.multiplayer);
    const games = (lanFirst.length >= 8 ? lanFirst : playable)
      .sort((a, b) => (b.releaseYear ?? 0) - (a.releaseYear ?? 0))
      .slice(0, 20);

    return { games, fetchedAt: new Date().toISOString() };
  },
);
