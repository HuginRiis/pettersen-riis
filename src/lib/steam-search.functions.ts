// Søk i Steam-katalogen (alle Windows-spill gjennom tidene) via Steams offentlige store-API.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

export const searchSteamGames = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ term: z.string().min(2).max(80) }).parse(data))
  .handler(async ({ data }): Promise<{ games: SteamGame[]; error?: string }> => {
    try {
      const res = await fetch(
        `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(
          data.term,
        )}&cc=no&l=english`,
        { headers: { "User-Agent": "Mozilla/5.0" } },
      );
      if (!res.ok) return { games: [], error: `Steam svarte ${res.status}` };
      const json = (await res.json()) as { items?: StoreSearchItem[] };
      const items = (json.items ?? []).slice(0, 12);

      const games = await Promise.all(
        items.map(async (it): Promise<SteamGame> => {
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
                success?: boolean;
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
              maxPlayersHint: null,
              releaseYear: yearMatch ? Number(yearMatch[0]) : null,
            };
          } catch {
            return base;
          }
        }),
      );

      return { games };
    } catch (e: unknown) {
      return { games: [], error: e instanceof Error ? e.message : "Ukjent feil" };
    }
  });
