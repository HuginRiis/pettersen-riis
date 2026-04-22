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
  LineChart as LineChartIcon,
  EyeOff,
  Plus,
  Check,
  ListChecks,
  Filter,
  Trash2,
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
  kassalCategory: string | null;
  cheapestPrice: number | null;
  cheapestStore: string | null;
  remaPrice: number | null;
  storeCount: number;
  rows: StoreRow[];
};

type GroceryFavorite = {
  id: string;
  ean: string | null;
  name: string;
  brand: string | null;
  image_url: string | null;
  vendor: string | null;
  category: string;
  kassal_category: string | null;
  price_nok: number | null;
  checked: boolean;
  manual: boolean;
  quantity: number | null;
  unit: string | null;
  sort_order: number;
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
  const [remaOnly, setRemaOnly] = useState(false);

  const [favorites, setFavorites] = useState<GroceryFavorite[]>([]);
  const [favHistory, setFavHistory] = useState<BulkHistory[]>([]);
  const [favLoading, setFavLoading] = useState(true);
  const [scannerOpen, setScannerOpen] = useState(false);

  // ── Favoritter (Lovable Cloud) ─────────────────────────────────────
  const SELECT_COLS =
    "id, ean, name, brand, image_url, vendor, category, kassal_category, price_nok, checked, manual, quantity, unit, sort_order";

  const loadFavorites = async () => {
    setFavLoading(true);
    const { data } = await supabase
      .from("grocery_favorites")
      .select(SELECT_COLS)
      .order("checked", { ascending: true })
      .order("category", { ascending: true })
      .order("created_at", { ascending: true });
    setFavorites((data as GroceryFavorite[]) ?? []);
    setFavLoading(false);
  };

  useEffect(() => {
    loadFavorites();
  }, []);

  // Hent prishistorikk for alle favoritter med EAN
  useEffect(() => {
    const eans = favorites.map((f) => f.ean).filter((x): x is string => !!x);
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
      const price = g.remaPrice ?? g.cheapestPrice ?? null;
      const { data } = await supabase
        .from("grocery_favorites")
        .insert({
          ean: g.ean,
          name: g.name,
          brand: g.brand,
          image_url: g.image,
          vendor: g.rows[0]?.storeName ?? null,
          category: "Annet",
          kassal_category: g.kassalCategory,
          price_nok: price,
          quantity: 1,
        })
        .select(SELECT_COLS)
        .single();
      if (data) setFavorites([data as GroceryFavorite, ...favorites]);
    }
  };

  const removeFavoriteById = async (id: string) => {
    setFavorites(favorites.filter((f) => f.id !== id));
    await supabase.from("grocery_favorites").delete().eq("id", id);
  };

  const updateFavorite = async (id: string, patch: Partial<GroceryFavorite>) => {
    setFavorites((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    );
    await supabase.from("grocery_favorites").update(patch).eq("id", id);
  };

  const addManualItem = async (
    name: string,
    quantity: number | null,
    price: number | null,
  ) => {
    const { data } = await supabase
      .from("grocery_favorites")
      .insert({
        ean: null,
        name,
        brand: null,
        image_url: null,
        vendor: null,
        category: "Annet",
        manual: true,
        quantity: quantity ?? 1,
        unit: null,
        price_nok: price,
      })
      .select(SELECT_COLS)
      .single();
    if (data) setFavorites([data as GroceryFavorite, ...favorites]);
  };

  const clearChecked = async () => {
    const ids = favorites.filter((f) => f.checked).map((f) => f.id);
    if (ids.length === 0) return;
    setFavorites(favorites.filter((f) => !f.checked));
    await supabase.from("grocery_favorites").delete().in("id", ids);
  };

  // ── Søk ────────────────────────────────────────────────────────────
  const runSearch = async (term: string) => {
    if (term.trim().length < 2) return;
    setLoading(true);
    setError(null);
    setSelected(null);
    setDetail(null);
    try {
      const res = await search({ data: { query: term.trim() } });
      setProducts(res.products as ProductGroup[]);
    } catch (err: any) {
      setError(err?.message ?? "Søket feilet");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const onSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    await runSearch(query);
  };

  const onBarcodeDetected = async (code: string) => {
    setScannerOpen(false);
    setQuery(code);
    await runSearch(code);
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

  const visibleProducts = useMemo(
    () => (remaOnly ? products.filter((p) => p.remaPrice != null) : products),
    [products, remaOnly],
  );

  return (
    <PageShell>
      <PageHero
        eyebrow="Markedet"
        title="Matvarekrøniken"
        subtitle="Mesterens speil over priser, isenkram og dagligvarer i norske butikker."
        image={matvarerImg}
      />

      <section className="container mx-auto px-4 py-8 md:py-12">
        {/* HANDLELISTE — øverst på siden */}
        <ShoppingListPanel
          favorites={favorites}
          loading={favLoading}
          onToggleChecked={(id, checked) => updateFavorite(id, { checked })}
          onChangeQuantity={(id, quantity) => updateFavorite(id, { quantity })}
          onRemove={removeFavoriteById}
          onAddManual={addManualItem}
          onClearChecked={clearChecked}
        />

        {/* Søkefelt */}
        <div className="mt-12">
          <div className="flex items-center gap-3 mb-4">
            <Search size={18} className="text-primary" />
            <h2 className="text-display tracking-[0.2em] text-primary text-sm uppercase">
              Søk i markedet
            </h2>
            <div className="h-px flex-1 bg-border" />
          </div>

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
                className="pl-9 pr-12"
              />
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10"
                aria-label="Skann strekkode"
                title="Skann strekkode"
              >
                <ScanLine size={18} />
              </button>
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

          {/* Filter-rad: Rema-only */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setRemaOnly((v) => !v)}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs tracking-widest uppercase border transition-colors ${
                remaOnly
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-primary hover:border-primary/60"
              }`}
              aria-pressed={remaOnly}
            >
              <Filter size={12} />
              Kun Rema 1000
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-4 text-sm text-destructive">{error}</p>
        )}

        {/* Søkeresultater */}
        {visibleProducts.length > 0 && (
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visibleProducts.slice(0, 30).map((g, idx) => (
              <ProductCard
                key={(g.ean ?? g.name) + idx}
                group={g}
                onOpen={() => openProduct(g)}
                onAddToList={() => toggleFavorite(g)}
                isFav={isFav(g.ean)}
              />
            ))}
          </div>
        )}

        {!loading && products.length > 0 && visibleProducts.length === 0 && remaOnly && (
          <p className="mt-8 text-sm text-muted-foreground">
            Ingen av treffene finnes på Rema 1000. Skru av filteret for å se alle.
          </p>
        )}

        {!loading && products.length === 0 && query && !error && (
          <p className="mt-8 text-sm text-muted-foreground">
            Ingen treff. Prøv færre ord eller annen stavemåte.
          </p>
        )}

        {/* Favoritter med graf */}
        <div className="mt-16">
          <div className="flex items-center gap-3 mb-6">
            <Star size={18} className="text-primary" />
            <h2 className="text-display tracking-[0.2em] text-primary text-sm uppercase">
              Prishistorikk — favoritter
            </h2>
            <div className="h-px flex-1 bg-border" />
          </div>

          {favLoading ? (
            <p className="text-sm text-muted-foreground">Henter favoritter…</p>
          ) : favorites.filter((f) => f.ean).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ingen Kassalapp-varer i lista enda. Søk og trykk «Legg til» for å
              følge prisutvikling.
            </p>
          ) : (
            <FavoritesGraph
              favorites={favorites.filter((f) => f.ean) as (GroceryFavorite & { ean: string })[]}
              history={favHistory}
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

      <BarcodeScannerDialog
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={onBarcodeDetected}
      />
    </PageShell>
  );
}

// ── Handleliste øverst på siden ──────────────────────────────────────
function ShoppingListPanel({
  favorites,
  loading,
  onToggleChecked,
  onChangeQuantity,
  onRemove,
  onAddManual,
  onClearChecked,
}: {
  favorites: GroceryFavorite[];
  loading: boolean;
  onToggleChecked: (id: string, checked: boolean) => void;
  onChangeQuantity: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
  onAddManual: (
    name: string,
    quantity: number | null,
    price: number | null,
  ) => void;
  onClearChecked: () => void;
}) {
  const [manualName, setManualName] = useState("");
  const [manualQty, setManualQty] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [hideChecked, setHideChecked] = useState(false);

  const visible = useMemo(() => {
    const filtered = hideChecked ? favorites.filter((f) => !f.checked) : favorites;
    return [...filtered].sort((a, b) => {
      if (a.checked !== b.checked) return a.checked ? 1 : -1;
      return a.name.localeCompare(b.name, "nb");
    });
  }, [favorites, hideChecked]);

  const totalCount = favorites.length;
  const checkedCount = favorites.filter((f) => f.checked).length;

  // Total-sum (alle ikke-avhakede varer med kjent pris × antall)
  const totalSum = useMemo(() => {
    return favorites
      .filter((f) => !f.checked && f.price_nok != null)
      .reduce((sum, f) => sum + (f.price_nok ?? 0) * (f.quantity ?? 1), 0);
  }, [favorites]);

  const checkedSum = useMemo(() => {
    return favorites
      .filter((f) => f.checked && f.price_nok != null)
      .reduce((sum, f) => sum + (f.price_nok ?? 0) * (f.quantity ?? 1), 0);
  }, [favorites]);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const name = manualName.trim();
    if (!name) return;
    const qty = manualQty.trim() ? Number(manualQty.replace(",", ".")) : null;
    const price = manualPrice.trim() ? Number(manualPrice.replace(",", ".")) : null;
    onAddManual(
      name,
      Number.isFinite(qty as number) ? (qty as number) : null,
      Number.isFinite(price as number) ? (price as number) : null,
    );
    setManualName("");
    setManualQty("");
    setManualPrice("");
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-wrap">
        <ListChecks size={18} className="text-primary" />
        <h2 className="text-display tracking-[0.2em] text-primary text-sm uppercase">
          Husets handleliste
        </h2>
        <span className="text-xs text-muted-foreground">
          {checkedCount}/{totalCount} kjøpt
        </span>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Total å handle
            </div>
            <div className="text-base font-display text-primary leading-tight">
              {fmtPrice(totalSum)}
            </div>
            {checkedSum > 0 && (
              <div className="text-[10px] text-muted-foreground">
                Kjøpt: {fmtPrice(checkedSum)}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setHideChecked((v) => !v)}
            className={`text-[11px] tracking-widest uppercase px-2 py-1 rounded border transition-colors ${
              hideChecked
                ? "border-primary text-primary"
                : "border-border text-muted-foreground hover:text-primary"
            }`}
          >
            {hideChecked ? "Vis kjøpte" : "Skjul kjøpte"}
          </button>
          {checkedCount > 0 && (
            <button
              type="button"
              onClick={onClearChecked}
              className="text-[11px] tracking-widest uppercase px-2 py-1 rounded border border-destructive/50 text-destructive hover:bg-destructive/10"
            >
              Tøm kjøpte
            </button>
          )}
        </div>
      </div>

      {/* Manuelt tillegg */}
      <form
        onSubmit={submitManual}
        className="flex flex-wrap gap-2 px-4 py-3 border-b border-border bg-background/30"
      >
        <Input
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
          placeholder="Legg til manuelt — f.eks. 'Bananer'"
          className="flex-1 min-w-[180px] h-9"
        />
        <Input
          value={manualQty}
          onChange={(e) => setManualQty(e.target.value)}
          placeholder="Antall"
          className="w-20 h-9"
          inputMode="decimal"
        />
        <Input
          value={manualPrice}
          onChange={(e) => setManualPrice(e.target.value)}
          placeholder="kr/stk"
          className="w-24 h-9"
          inputMode="decimal"
        />
        <Button type="submit" size="sm" disabled={!manualName.trim()}>
          <Plus size={14} className="mr-1" /> Legg til
        </Button>
      </form>

      {/* Liste */}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Henter handleliste…</p>
      ) : visible.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          Handlelista er tom. Legg til varer manuelt over, eller søk i markedet
          og trykk «Legg til».
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((f) => {
            const qty = f.quantity ?? 1;
            const lineTotal = f.price_nok != null ? f.price_nok * qty : null;
            return (
              <li
                key={f.id}
                className={`flex items-center gap-2 px-4 py-2 text-sm ${
                  f.checked ? "opacity-50 line-through" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => onToggleChecked(f.id, !f.checked)}
                  className={`w-5 h-5 shrink-0 rounded border flex items-center justify-center transition-colors ${
                    f.checked
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-border hover:border-primary"
                  }`}
                  aria-label={f.checked ? "Hak av som ikke kjøpt" : "Hak av som kjøpt"}
                >
                  {f.checked && <Check size={12} />}
                </button>
                {f.image_url && !f.manual ? (
                  <img
                    src={f.image_url}
                    alt=""
                    className="w-6 h-6 rounded object-contain bg-background/40 shrink-0"
                  />
                ) : null}
                <div className="flex-1 min-w-0">
                  <div className="truncate">
                    {f.name}
                    {f.manual && (
                      <span className="ml-2 text-[9px] uppercase tracking-widest text-muted-foreground">
                        manuelt
                      </span>
                    )}
                  </div>
                  {f.brand && !f.manual && (
                    <div className="text-[10px] text-muted-foreground/80 truncate">
                      {f.brand}
                    </div>
                  )}
                </div>

                {/* Antall +/- */}
                <div className="flex items-center gap-1 shrink-0 no-underline">
                  <button
                    type="button"
                    onClick={() => onChangeQuantity(f.id, Math.max(1, qty - 1))}
                    disabled={qty <= 1}
                    className="w-6 h-6 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary disabled:opacity-30 disabled:hover:text-muted-foreground disabled:hover:border-border flex items-center justify-center text-sm leading-none"
                    aria-label="Færre"
                  >
                    −
                  </button>
                  <span className="w-7 text-center text-xs font-display tabular-nums">
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChangeQuantity(f.id, qty + 1)}
                    className="w-6 h-6 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary flex items-center justify-center text-sm leading-none"
                    aria-label="Flere"
                  >
                    +
                  </button>
                </div>

                {lineTotal != null && (
                  <span className="text-xs font-display text-primary shrink-0 tabular-nums w-20 text-right">
                    {fmtPrice(lineTotal)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(f.id)}
                  className="text-muted-foreground hover:text-destructive p-1 shrink-0"
                  aria-label="Fjern"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Produkt-kort i søk ────────────────────────────────────────────────
function ProductCard({
  group,
  onOpen,
  onAddToList,
  isFav,
}: {
  group: ProductGroup;
  onOpen: () => void;
  onAddToList: () => void;
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
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Rema 1000
          </div>
          <div
            className={`text-base font-display ${
              group.remaPrice != null ? "text-primary" : "text-muted-foreground"
            }`}
          >
            {group.remaPrice != null ? fmtPrice(group.remaPrice) : "Ikke i Rema"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Billigst{group.cheapestStore ? ` — ${group.cheapestStore}` : ""}
          </div>
          <div className="text-base font-display text-primary">
            {fmtPrice(group.cheapestPrice)}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {group.storeCount} butikk{group.storeCount === 1 ? "" : "er"}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={isFav ? "outline" : "default"}
          onClick={onAddToList}
          disabled={!group.ean}
          className="flex-1"
        >
          {isFav ? (
            <>
              <Star size={14} className="mr-1 fill-current" /> På lista
            </>
          ) : (
            <>
              <Plus size={14} className="mr-1" /> Legg til
            </>
          )}
        </Button>
        <button
          onClick={onOpen}
          className="text-xs tracking-widest uppercase text-primary/80 hover:text-primary px-2"
        >
          Detaljer →
        </button>
      </div>
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
function FavoritesGraph({
  favorites,
  history,
}: {
  favorites: (GroceryFavorite & { ean: string })[];
  history: BulkHistory[];
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggleHidden = (ean: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(ean)) next.delete(ean);
      else next.add(ean);
      return next;
    });

  const chart = useMemo(() => {
    const map = new Map<string, Record<string, number | string>>();
    const keys: { ean: string; label: string }[] = [];
    for (const fav of favorites) {
      if (hidden.has(fav.ean)) continue;
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
  }, [favorites, history, hidden]);

  return (
    <div className="space-y-6">
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
          const isHidden = hidden.has(f.ean);
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
                onClick={() => toggleHidden(f.ean)}
                className={`p-1 ${
                  isHidden
                    ? "text-muted-foreground hover:text-primary"
                    : "text-primary hover:text-primary/70"
                }`}
                aria-label={isHidden ? "Vis i graf" : "Skjul fra graf"}
                title={isHidden ? "Vis i graf" : "Skjul fra graf"}
              >
                {isHidden ? <EyeOff size={14} /> : <LineChartIcon size={14} />}
              </button>
            </div>
          );
        })}
      </div>

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
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="line" />
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
