import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Search,
  Loader2,
  Star,
  StarOff,
  ExternalLink,
  TrendingDown,
  ShoppingBasket,
  X,
  ScanLine,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { PageShell, PageHero } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  searchGroceryProducts,
  getGroceryProduct,
  getGroceryPriceHistory,
  type KassalProduct,
  type BulkHistory,
} from "@/server/kassalapp";
import matvarerImg from "@/assets/got-matvarer.jpg";
import { BarcodeScannerDialog } from "@/components/BarcodeScannerDialog";

export const Route = createFileRoute("/matvarer")({
  head: () => ({
    meta: [
      { title: "Matvarekrøniken — Pris og isenkram | House Pettersen Riis" },
      {
        name: "description",
        content:
          "Søk i norske dagligvarer, sammenlign pris på tvers av butikker og følg prishistorikken over tid.",
      },
      { property: "og:title", content: "Matvarekrøniken | House Pettersen Riis" },
      {
        property: "og:description",
        content: "Mesterens speil over markedet — pris og produktinfo fra alle de store butikkene.",
      },
      { property: "og:image", content: matvarerImg },
    ],
  }),
  errorComponent: ({ error }) => (
    <PageShell>
      <div className="container mx-auto px-4 py-16">
        <h1 className="text-2xl text-primary mb-2">Markedet er stengt</h1>
        <p className="text-muted-foreground">{error.message}</p>
      </div>
    </PageShell>
  ),
  component: MatvarerPage,
});

type StoreRow = {
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

type ProductGroup = {
  ean: string | null;
  name: string;
  brand: string | null;
  image: string | null;
  cheapestPrice: number | null;
  cheapestStore: string | null;
  storeCount: number;
  rows: StoreRow[];
};

type GroceryFavorite = {
  id: string;
  ean: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  vendor: string | null;
};

const fmtPrice = (n: number | null | undefined) =>
  typeof n === "number" ? `kr ${n.toFixed(2).replace(".", ",")}` : "—";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("nb-NO", { day: "2-digit", month: "short" });
};

const STORE_COLORS = [
  "oklch(0.78 0.14 80)",
  "oklch(0.65 0.20 25)",
  "oklch(0.70 0.15 200)",
  "oklch(0.75 0.18 140)",
  "oklch(0.65 0.22 290)",
  "oklch(0.78 0.15 50)",
];

function MatvarerPage() {
  const search = useServerFn(searchGroceryProducts);
  const fetchProduct = useServerFn(getGroceryProduct);
  const fetchHistory = useServerFn(getGroceryPriceHistory);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductGroup[]>([]);
  const [selected, setSelected] = useState<ProductGroup | null>(null);
  const [detail, setDetail] = useState<KassalProduct | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [favorites, setFavorites] = useState<GroceryFavorite[]>([]);
  const [favHistory, setFavHistory] = useState<BulkHistory[]>([]);
  const [favLoading, setFavLoading] = useState(true);
  const [scannerOpen, setScannerOpen] = useState(false);

  // ── Favoritter (Lovable Cloud) ─────────────────────────────────────
  const loadFavorites = async () => {
    setFavLoading(true);
    const { data } = await supabase
      .from("grocery_favorites")
      .select("id, ean, name, brand, image_url, vendor")
      .order("created_at", { ascending: false });
    setFavorites((data as GroceryFavorite[]) ?? []);
    setFavLoading(false);
  };

  useEffect(() => {
    loadFavorites();
  }, []);

  // Hent prishistorikk for alle favoritter når lista endres
  useEffect(() => {
    const eans = favorites.map((f) => f.ean).filter(Boolean);
    if (eans.length === 0) {
      setFavHistory([]);
      return;
    }
    fetchHistory({ data: { eans, days: 60 } })
      .then((res) => setFavHistory(res.items))
      .catch(() => setFavHistory([]));
  }, [favorites, fetchHistory]);

  const isFav = (ean: string | null) =>
    !!ean && favorites.some((f) => f.ean === ean);

  const toggleFavorite = async (g: ProductGroup) => {
    if (!g.ean) return;
    const existing = favorites.find((f) => f.ean === g.ean);
    if (existing) {
      setFavorites(favorites.filter((f) => f.id !== existing.id));
      await supabase.from("grocery_favorites").delete().eq("id", existing.id);
    } else {
      const { data } = await supabase
        .from("grocery_favorites")
        .insert({
          ean: g.ean,
          name: g.name,
          brand: g.brand,
          image_url: g.image,
          vendor: g.rows[0]?.storeName ?? null,
        })
        .select("id, ean, name, brand, image_url, vendor")
        .single();
      if (data) setFavorites([data as GroceryFavorite, ...favorites]);
    }
  };

  const removeFavoriteById = async (id: string) => {
    setFavorites(favorites.filter((f) => f.id !== id));
    await supabase.from("grocery_favorites").delete().eq("id", id);
  };

  // ── Søk ────────────────────────────────────────────────────────────
  const onSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (query.trim().length < 2) return;
    setLoading(true);
    setError(null);
    setSelected(null);
    setDetail(null);
    try {
      const res = await search({ data: { query: query.trim() } });
      setProducts(res.products as ProductGroup[]);
    } catch (err: any) {
      setError(err?.message ?? "Søket feilet");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const openProduct = async (g: ProductGroup) => {
    setSelected(g);
    setDetail(null);
    const cheapest = g.rows.find((r) => r.price != null) ?? g.rows[0];
    if (!cheapest?.productId) return;
    setDetailLoading(true);
    try {
      const d = await fetchProduct({ data: { productId: cheapest.productId } });
      setDetail(d);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <PageShell>
      <PageHero
        eyebrow="Markedet"
        title="Matvarekrøniken"
        subtitle="Mesterens speil over priser, isenkram og dagligvarer i norske butikker."
        image={matvarerImg}
      />

      <section className="container mx-auto px-4 py-8 md:py-12">
        {/* Søkefelt */}
        <form
          onSubmit={onSearch}
          className="flex flex-col sm:flex-row gap-3 max-w-2xl"
        >
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Søk på vare — f.eks. 'grandiosa kjøttdeig'"
              className="pl-9"
            />
          </div>
          <Button type="submit" disabled={loading || query.trim().length < 2}>
            {loading ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" /> Leter…
              </>
            ) : (
              <>Søk i markedet</>
            )}
          </Button>
        </form>

        {error && (
          <p className="mt-4 text-sm text-destructive">{error}</p>
        )}

        {/* Søkeresultater */}
        {products.length > 0 && (
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {products.slice(0, 30).map((g, idx) => (
              <ProductCard
                key={(g.ean ?? g.name) + idx}
                group={g}
                onOpen={() => openProduct(g)}
                onToggleFav={() => toggleFavorite(g)}
                isFav={isFav(g.ean)}
              />
            ))}
          </div>
        )}

        {!loading && products.length === 0 && query && !error && (
          <p className="mt-8 text-sm text-muted-foreground">
            Ingen treff. Prøv færre ord eller annen stavemåte.
          </p>
        )}

        {/* Favoritter */}
        <div className="mt-16">
          <div className="flex items-center gap-3 mb-6">
            <Star size={18} className="text-primary" />
            <h2 className="text-display tracking-[0.2em] text-primary text-sm uppercase">
              Husets handleliste
            </h2>
            <div className="h-px flex-1 bg-border" />
          </div>

          {favLoading ? (
            <p className="text-sm text-muted-foreground">Henter favoritter…</p>
          ) : favorites.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Du har ingen favoritter enda. Trykk på stjernen i et søkeresultat
              for å følge varen over tid.
            </p>
          ) : (
            <FavoritesPanel
              favorites={favorites}
              history={favHistory}
              onRemove={removeFavoriteById}
            />
          )}
        </div>
      </section>

      {/* Produktdetalj-modal */}
      {selected && (
        <ProductDetailDialog
          group={selected}
          detail={detail}
          loading={detailLoading}
          onClose={() => {
            setSelected(null);
            setDetail(null);
          }}
        />
      )}
    </PageShell>
  );
}

// ── Produkt-kort i søk ────────────────────────────────────────────────
function ProductCard({
  group,
  onOpen,
  onToggleFav,
  isFav,
}: {
  group: ProductGroup;
  onOpen: () => void;
  onToggleFav: () => void;
  isFav: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3 hover:border-primary/60 transition-colors">
      <div className="flex gap-3">
        {group.image ? (
          <img
            src={group.image}
            alt=""
            className="w-16 h-16 rounded object-contain bg-background/40"
            loading="lazy"
          />
        ) : (
          <div className="w-16 h-16 rounded bg-background/40 flex items-center justify-center">
            <ShoppingBasket size={20} className="text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <button
            onClick={onOpen}
            className="text-left text-sm font-medium leading-snug line-clamp-2 hover:text-primary"
          >
            {group.name}
          </button>
          {group.brand && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {group.brand}
            </div>
          )}
        </div>
        <button
          onClick={onToggleFav}
          disabled={!group.ean}
          className="text-primary disabled:opacity-30"
          title={isFav ? "Fjern fra handleliste" : "Legg til handleliste"}
          aria-label={isFav ? "Fjern fra handleliste" : "Legg til handleliste"}
        >
          {isFav ? <Star size={16} className="fill-primary" /> : <StarOff size={16} />}
        </button>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Billigst nå
          </div>
          <div className="text-lg font-display text-primary">
            {fmtPrice(group.cheapestPrice)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {group.cheapestStore ?? "—"}
          </div>
          <div className="text-xs text-muted-foreground">
            {group.storeCount} butikk{group.storeCount === 1 ? "" : "er"}
          </div>
        </div>
      </div>

      <button
        onClick={onOpen}
        className="text-xs tracking-widest uppercase text-primary/80 hover:text-primary text-left"
      >
        Se sammenligning →
      </button>
    </div>
  );
}

// ── Detalj-dialog ──────────────────────────────────────────────────────
function ProductDetailDialog({
  group,
  detail,
  loading,
  onClose,
}: {
  group: ProductGroup;
  detail: KassalProduct | null;
  loading: boolean;
  onClose: () => void;
}) {
  const sortedRows = useMemo(
    () => [...group.rows].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)),
    [group.rows],
  );
  const cheapest = sortedRows.find((r) => r.price != null);

  const chartData = useMemo(() => {
    if (!detail) return [];
    return detail.priceHistory.map((p) => ({
      date: fmtDate(p.date),
      pris: p.price,
    }));
  }, [detail]);

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start md:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-lg border border-border bg-card my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-muted-foreground hover:text-primary p-2"
          aria-label="Lukk"
        >
          <X size={18} />
        </button>

        <div className="p-6 border-b border-border flex gap-4">
          {group.image ? (
            <img
              src={group.image}
              alt=""
              className="w-20 h-20 rounded object-contain bg-background/40"
            />
          ) : (
            <div className="w-20 h-20 rounded bg-background/40" />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg md:text-xl font-display text-primary">
              {group.name}
            </h2>
            {group.brand && (
              <p className="text-xs text-muted-foreground mt-1">{group.brand}</p>
            )}
            {cheapest && (
              <p className="text-sm mt-2">
                <span className="text-muted-foreground">Billigst nå: </span>
                <span className="text-primary font-display">
                  {fmtPrice(cheapest.price)}
                </span>
                <span className="text-muted-foreground"> hos {cheapest.storeName}</span>
              </p>
            )}
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Pris pr butikk */}
          <div>
            <h3 className="text-xs tracking-widest uppercase text-muted-foreground mb-3 flex items-center gap-2">
              <TrendingDown size={14} /> Pris pr butikk
            </h3>
            <div className="rounded-md border border-border divide-y divide-border">
              {sortedRows.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${
                    i === 0 ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {r.storeLogo ? (
                      <img
                        src={r.storeLogo}
                        alt=""
                        className="w-6 h-6 rounded object-contain bg-background/40"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded bg-background/40" />
                    )}
                    <span className="truncate">{r.storeName}</span>
                    {i === 0 && (
                      <span className="text-[10px] tracking-widest text-primary uppercase">
                        Billigst
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-display text-primary">
                      {fmtPrice(r.price)}
                    </span>
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-primary"
                        aria-label="Åpne i butikk"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Prishistorikk */}
          <div>
            <h3 className="text-xs tracking-widest uppercase text-muted-foreground mb-3">
              Prishistorikk (siste periode)
            </h3>
            {loading ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : chartData.length > 1 ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="oklch(0.30 0.014 240 / 50%)" strokeDasharray="3 3" />
                    <XAxis dataKey="date" stroke="oklch(0.68 0.02 80)" fontSize={11} />
                    <YAxis stroke="oklch(0.68 0.02 80)" fontSize={11} width={40} />
                    <Tooltip
                      contentStyle={{
                        background: "oklch(0.18 0.014 240)",
                        border: "1px solid oklch(0.30 0.014 240 / 60%)",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                      formatter={(v: any) => [fmtPrice(Number(v)), "Pris"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="pris"
                      stroke="oklch(0.78 0.14 80)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ingen prishistorikk tilgjengelig for denne varen.
              </p>
            )}
          </div>

          {/* Produktinfo */}
          {detail && (
            <div className="grid gap-4 md:grid-cols-2 text-sm">
              {detail.description && (
                <div>
                  <h4 className="text-xs tracking-widest uppercase text-muted-foreground mb-1">
                    Beskrivelse
                  </h4>
                  <p className="text-foreground/90 leading-relaxed">
                    {detail.description}
                  </p>
                </div>
              )}
              {detail.ingredients && (
                <div>
                  <h4 className="text-xs tracking-widest uppercase text-muted-foreground mb-1">
                    Ingredienser
                  </h4>
                  <p className="text-foreground/80 leading-relaxed">
                    {detail.ingredients}
                  </p>
                </div>
              )}
              {detail.allergens.length > 0 && (
                <div>
                  <h4 className="text-xs tracking-widest uppercase text-muted-foreground mb-1">
                    Allergener
                  </h4>
                  <ul className="text-foreground/80 space-y-0.5">
                    {detail.allergens.map((a, i) => (
                      <li key={i}>
                        {a.display}{" "}
                        <span className="text-muted-foreground">— {a.contains}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {detail.nutrition.length > 0 && (
                <div>
                  <h4 className="text-xs tracking-widest uppercase text-muted-foreground mb-1">
                    Næringsinnhold
                  </h4>
                  <ul className="text-foreground/80 space-y-0.5">
                    {detail.nutrition.slice(0, 8).map((n, i) => (
                      <li key={i}>
                        {n.display}: {n.amount}
                        {n.unit}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Favoritter med samlet historikk-graf ───────────────────────────────
function FavoritesPanel({
  favorites,
  history,
  onRemove,
}: {
  favorites: GroceryFavorite[];
  history: BulkHistory[];
  onRemove: (id: string) => void;
}) {
  // Bygg datasett: alle datoer på tvers av favoritter, én linje per vare.
  const chart = useMemo(() => {
    const map = new Map<string, Record<string, number | string>>();
    const keys: { ean: string; label: string }[] = [];
    for (const fav of favorites) {
      const entry = history.find((h) => h.ean === fav.ean);
      if (!entry) continue;
      const label = fav.name.length > 28 ? fav.name.slice(0, 28) + "…" : fav.name;
      keys.push({ ean: fav.ean, label });
      for (const point of entry.history) {
        const row = map.get(point.date) ?? { date: point.date };
        row[label] = point.price;
        map.set(point.date, row);
      }
    }
    const rows = Array.from(map.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
    const display = rows.map((r) => ({ ...r, date: fmtDate(String(r.date)) }));
    return { rows: display, keys };
  }, [favorites, history]);

  return (
    <div className="space-y-6">
      {/* Liste */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {favorites.map((f) => {
          const h = history.find((x) => x.ean === f.ean);
          const series = h?.history ?? [];
          const min = series.length ? Math.min(...series.map((s) => s.price)) : null;
          const remaPrice = h?.remaPrice ?? null;
          const cheapestPrice = h?.currentMin ?? null;
          const cheapestStore = h?.currentStore ?? null;
          const remaIsCheapest =
            remaPrice != null &&
            cheapestPrice != null &&
            Math.abs(remaPrice - cheapestPrice) < 0.005;
          return (
            <div
              key={f.id}
              className="rounded-lg border border-border bg-card p-3 flex gap-3 items-start"
            >
              {f.image_url ? (
                <img
                  src={f.image_url}
                  alt=""
                  className="w-12 h-12 rounded object-contain bg-background/40"
                />
              ) : (
                <div className="w-12 h-12 rounded bg-background/40" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium leading-snug line-clamp-2">
                  {f.name}
                </div>

                {/* Pris-blokker: Rema 1000 + billigste butikk */}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded border border-border/60 bg-background/30 px-2 py-1.5">
                    <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
                      Rema 1000
                    </div>
                    <div
                      className={`text-sm font-display ${
                        remaPrice != null ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {remaPrice != null ? fmtPrice(remaPrice) : "Ikke i Rema"}
                    </div>
                  </div>
                  <div
                    className={`rounded border px-2 py-1.5 ${
                      remaIsCheapest
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/60 bg-background/30"
                    }`}
                  >
                    <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
                      Billigst{cheapestStore ? ` — ${cheapestStore}` : ""}
                    </div>
                    <div
                      className={`text-sm font-display ${
                        cheapestPrice != null ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {fmtPrice(cheapestPrice)}
                    </div>
                  </div>
                </div>

                {min != null && (
                  <div className="text-[11px] text-muted-foreground mt-1.5">
                    Lavest siste 60 dager:{" "}
                    <span className="text-primary/80">{fmtPrice(min)}</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => onRemove(f.id)}
                className="text-muted-foreground hover:text-destructive p-1"
                aria-label="Fjern"
                title="Fjern fra handleliste"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Samlet historikk-graf */}
      {chart.keys.length > 0 && chart.rows.length > 1 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs tracking-widest uppercase text-muted-foreground mb-3">
            Pris over tid — favoritter (laveste pr dag)
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart.rows}>
                <CartesianGrid stroke="oklch(0.30 0.014 240 / 50%)" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="oklch(0.68 0.02 80)" fontSize={11} />
                <YAxis stroke="oklch(0.68 0.02 80)" fontSize={11} width={40} />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.18 0.014 240)",
                    border: "1px solid oklch(0.30 0.014 240 / 60%)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  formatter={(v: any) => [fmtPrice(Number(v)), ""]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  iconType="line"
                />
                {chart.keys.map((k, i) => (
                  <Line
                    key={k.ean}
                    type="monotone"
                    dataKey={k.label}
                    stroke={STORE_COLORS[i % STORE_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
