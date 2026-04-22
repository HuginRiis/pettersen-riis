import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { z } from "zod";

// ── Husets dørvakt — samme mønster som de andre serverfunksjonene ──
type SessionData = { authenticated?: boolean };
function getSessionConfig() {
  const base = process.env.HOUSE_RIIS_PASSWORD ?? "";
  const derived = (base + "::house-riis-session-v1::winter-is-ours").repeat(4).slice(0, 64);
  return {
    password: derived,
    name: "house_riis_session",
    maxAge: 60 * 60 * 24 * 30,
    cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
  };
}
async function requireHouseAuth() {
  const session = await useSession<SessionData>(getSessionConfig());
  if (session.data?.authenticated !== true) {
    throw new Error("Du må logge inn på huset først.");
  }
}

const KASSAL_BASE = "https://kassal.app/api/v1";

async function kassalFetch(path: string, init?: RequestInit) {
  const token = process.env.KASSAL_APP_TOKEN;
  if (!token) throw new Error("KASSAL_APP_TOKEN mangler i serverkonfigurasjon");
  const res = await fetch(`${KASSAL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kassalapp ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ── Typer som bobler opp til frontend ──────────────────────────────────
export type KassalProduct = {
  id: number;
  name: string;
  brand: string | null;
  vendor: string | null;
  ean: string | null;
  image: string | null;
  description: string | null;
  ingredients: string | null;
  url: string | null;
  currentPrice: number | null;
  currentUnitPrice: number | null;
  store: { name: string | null; logo: string | null; code: string | null };
  allergens: Array<{ code: string; display: string; contains: string }>;
  nutrition: Array<{ code: string; display: string; amount: number; unit: string }>;
  priceHistory: Array<{ date: string; price: number }>;
};

export type StorePriceRow = {
  productId: number;
  storeName: string;
  storeLogo: string | null;
  productName: string;
  brand: string | null;
  image: string | null;
  ean: string | null;
  price: number | null;
  unitPrice: number | null;
  url: string | null;
};

// ── Søk: returner én rad per butikk så vi kan sammenligne pris ─────────
export const searchGroceryProducts = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string }) =>
    z
      .object({
        query: z.string().trim().min(2, "Søk må ha minst 2 tegn").max(120),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const q = encodeURIComponent(data.query);
    const json = (await kassalFetch(`/products?search=${q}&size=60`)) as {
      data?: any[];
    };
    const items = Array.isArray(json?.data) ? json.data : [];

    const rows: StorePriceRow[] = items.map((p: any) => {
      const price =
        typeof p?.current_price === "number"
          ? p.current_price
          : typeof p?.price === "number"
            ? p.price
            : null;
      return {
        productId: Number(p?.id ?? 0),
        storeName: p?.store?.name ?? p?.store ?? "Ukjent butikk",
        storeLogo: p?.store?.logo ?? null,
        productName: p?.name ?? "Ukjent vare",
        brand: p?.brand ?? null,
        image: p?.image ?? null,
        ean: p?.ean ?? null,
        price,
        unitPrice: typeof p?.current_unit_price === "number" ? p.current_unit_price : null,
        url: p?.url ?? null,
      };
    });

    // Grupper på EAN (eller normalisert navn hvis EAN mangler) og hold kun
    // billigste pris per butikk innen samme produkt.
    const groups = new Map<
      string,
      { ean: string | null; name: string; brand: string | null; image: string | null; rows: StorePriceRow[] }
    >();
    for (const r of rows) {
      const key = r.ean ?? `name:${r.productName.toLowerCase().trim()}`;
      const g =
        groups.get(key) ??
        { ean: r.ean, name: r.productName, brand: r.brand, image: r.image, rows: [] as StorePriceRow[] };
      // Bare billigste pr butikk
      const existing = g.rows.find((x) => x.storeName === r.storeName);
      if (!existing) g.rows.push(r);
      else if ((r.price ?? Infinity) < (existing.price ?? Infinity)) {
        Object.assign(existing, r);
      }
      groups.set(key, g);
    }

    const products = Array.from(groups.values()).map((g) => {
      const sorted = [...g.rows].sort(
        (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
      );
      const cheapest = sorted.find((r) => r.price != null) ?? null;
      return {
        ean: g.ean,
        name: g.name,
        brand: g.brand,
        image: g.image,
        cheapestPrice: cheapest?.price ?? null,
        cheapestStore: cheapest?.storeName ?? null,
        storeCount: sorted.length,
        rows: sorted,
      };
    });

    // Sorter produktgrupper etter billigste pris
    products.sort(
      (a, b) => (a.cheapestPrice ?? Infinity) - (b.cheapestPrice ?? Infinity),
    );

    return { products };
  });

// ── Detaljer + prishistorikk ───────────────────────────────────────────
export const getGroceryProduct = createServerFn({ method: "POST" })
  .inputValidator((input: { productId: number }) =>
    z.object({ productId: z.number().int().positive() }).parse(input),
  )
  .handler(async ({ data }): Promise<KassalProduct> => {
    await requireHouseAuth();
    const json = (await kassalFetch(`/products/id/${data.productId}`)) as { data?: any };
    const p = json?.data ?? {};

    const priceHistory: Array<{ date: string; price: number }> = Array.isArray(
      p?.price_history,
    )
      ? p.price_history
          .map((h: any) => ({
            date: String(h?.date ?? ""),
            price: typeof h?.price === "number" ? h.price : Number(h?.price ?? NaN),
          }))
          .filter((h: any) => h.date && Number.isFinite(h.price))
          .sort((a: any, b: any) => a.date.localeCompare(b.date))
      : [];

    return {
      id: Number(p?.id ?? data.productId),
      name: p?.name ?? "Ukjent vare",
      brand: p?.brand ?? null,
      vendor: p?.vendor ?? null,
      ean: p?.ean ?? null,
      image: p?.image ?? null,
      description: p?.description ?? null,
      ingredients: p?.ingredients ?? null,
      url: p?.url ?? null,
      currentPrice:
        typeof p?.current_price === "number" ? p.current_price : null,
      currentUnitPrice:
        typeof p?.current_unit_price === "number" ? p.current_unit_price : null,
      store: {
        name: p?.store?.name ?? null,
        logo: p?.store?.logo ?? null,
        code: p?.store?.code ?? null,
      },
      allergens: Array.isArray(p?.allergens)
        ? p.allergens.map((a: any) => ({
            code: a?.code ?? "",
            display: a?.display_name ?? a?.code ?? "",
            contains: a?.contains ?? "",
          }))
        : [],
      nutrition: Array.isArray(p?.nutrition)
        ? p.nutrition.map((n: any) => ({
            code: n?.code ?? "",
            display: n?.display_name ?? n?.code ?? "",
            amount: typeof n?.amount === "number" ? n.amount : Number(n?.amount ?? 0),
            unit: n?.unit ?? "",
          }))
        : [],
      priceHistory,
    };
  });

// ── Bulk prishistorikk for en liste EAN (favoritter) ───────────────────
//
// Vi kaller `/products/ean/{ean}` per favoritt — det endepunktet returnerer
// ALLE butikker som fører varen, med både gjeldende pris og prishistorikk.
// Det er den eneste pålitelige måten å få Rema 1000 + billigste butikk på.
export type BulkHistory = {
  ean: string;
  history: Array<{ date: string; price: number }>;
  currentPrice: number | null;
  currentMin: number | null;
  currentStore: string | null;
  /** Pris pr butikk akkurat nå. */
  storePrices: Array<{ store: string; price: number | null; url: string | null }>;
  remaPrice: number | null;
};

type EanProduct = {
  store: string;
  price: number | null;
  url: string | null;
  history: Array<{ date: string; price: number }>;
};

async function fetchEanProducts(ean: string): Promise<EanProduct[]> {
  try {
    const res = (await kassalFetch(`/products/ean/${encodeURIComponent(ean)}`)) as {
      data?: { products?: any[] } | any[];
    };
    // API kan returnere enten { data: { products: [...] } } eller { data: [...] }
    const root: any = (res as any)?.data ?? {};
    const items: any[] = Array.isArray(root)
      ? root
      : Array.isArray(root?.products)
        ? root.products
        : [];

    return items.map((p: any) => {
      const storeName: string =
        p?.store?.name ?? p?.store ?? p?.vendor ?? "Ukjent";
      const price =
        typeof p?.current_price === "number"
          ? p.current_price
          : typeof p?.price === "number"
            ? p.price
            : null;
      const history: Array<{ date: string; price: number }> = Array.isArray(
        p?.price_history,
      )
        ? p.price_history
            .map((h: any) => ({
              date: String(h?.date ?? "").slice(0, 10),
              price:
                typeof h?.price === "number" ? h.price : Number(h?.price ?? NaN),
            }))
            .filter((h: any) => h.date && Number.isFinite(h.price))
        : [];
      return { store: storeName, price, url: p?.url ?? null, history };
    });
  } catch (e) {
    console.warn("fetchEanProducts feilet for", ean, e);
    return [];
  }
}

export const getGroceryPriceHistory = createServerFn({ method: "POST" })
  .inputValidator((input: { eans: string[]; days?: number }) =>
    z
      .object({
        eans: z.array(z.string().min(8).max(20)).min(1).max(50),
        days: z.number().int().min(7).max(90).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireHouseAuth();

    const days = data.days ?? 60;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffIso = cutoff.toISOString().slice(0, 10);

    const out: BulkHistory[] = await Promise.all(
      data.eans.map(async (ean) => {
        const products = await fetchEanProducts(ean);

        // Behold kun billigste rad pr butikk (fjern duplikater)
        const byStore = new Map<string, EanProduct>();
        for (const p of products) {
          const existing = byStore.get(p.store);
          if (!existing) byStore.set(p.store, p);
          else if (
            p.price != null &&
            (existing.price == null || p.price < existing.price)
          ) {
            byStore.set(p.store, p);
          }
        }
        const stores = Array.from(byStore.values());

        // Slå sammen prishistorikk på tvers av butikker — laveste pr dag.
        const dayMap = new Map<string, number>();
        for (const p of stores) {
          for (const h of p.history) {
            if (h.date < cutoffIso) continue;
            const cur = dayMap.get(h.date);
            if (cur == null || h.price < cur) dayMap.set(h.date, h.price);
          }
        }
        const history = Array.from(dayMap.entries())
          .map(([date, price]) => ({ date, price }))
          .sort((a, b) => a.date.localeCompare(b.date));

        // Billigste butikk akkurat nå
        const priced = stores.filter((s) => s.price != null);
        const cheapest = priced.sort(
          (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
        )[0];

        // Rema 1000-pris
        const rema = stores.find((s) => /rema/i.test(s.store));

        return {
          ean,
          history,
          currentPrice: cheapest?.price ?? null,
          currentMin: cheapest?.price ?? null,
          currentStore: cheapest?.store ?? null,
          storePrices: stores.map((s) => ({
            store: s.store,
            price: s.price,
            url: s.url,
          })),
          remaPrice: rema?.price ?? null,
        };
      }),
    );

    return { items: out };
  });
