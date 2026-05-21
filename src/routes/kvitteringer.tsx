import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Camera,
  Upload,
  Loader2,
  Search,
  Sparkles,
  X,
  Trash2,
  Pencil,
  Save,
  Plus,
  Receipt as ReceiptIcon,
  ChevronDown,
  ChevronRight,
  Bell,
  ShieldCheck,
  Apple,
  Package,
  Send,
} from "lucide-react";
import { sendWarrantyTestPush } from "@/server/warranty-push.functions";
import { PageShell, PageHero } from "@/components/PageShell";
import { getStoredWho } from "@/lib/push-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { parseReceiptImage, type ReceiptItem } from "@/server/receipt-ai";
import { compressImageToWebp } from "@/lib/image-compress";
import matvarerImg from "@/assets/got-matvarer.jpg";
import { toast } from "sonner";

export const Route = createFileRoute("/kvitteringer")({
  head: () => ({
    meta: [
      { title: "Kvitterings­arkivet — Varer | House Pettersen Riis" },
      {
        name: "description",
        content:
          "Ta bilde av kvitteringen, og AI leser automatisk butikk, dato, varer og pris. Søk i hele arkivet.",
      },
      { property: "og:title", content: "Kvitteringsarkivet | House Pettersen Riis" },
      {
        property: "og:description",
        content: "AI leser kvitteringer og lagrer dem i et søkbart arkiv.",
      },
      { property: "og:image", content: matvarerImg },
    ],
  }),
  component: KvitteringerPage,
});

type ReceiptRow = {
  id: string;
  store: string | null;
  purchased_at: string | null;
  total_nok: number | null;
  currency: string;
  items: ReceiptItem[];
  ai_raw_text: string | null;
  ai_model: string | null;
  notes: string | null;
  image_url: string;
  image_path: string;
  created_at: string;
  updated_at: string;
  is_food: boolean;
  added_by: string;
  warranty_recipient: string;
  warranty_notified_90: string | null;
  warranty_notified_60: string | null;
  warranty_notified_30: string | null;
};

const WHO_OPTIONS = ["Alle", "Arne & Rebekka", "Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"] as const;

const fmtPrice = (n: number | null | undefined) =>
  typeof n === "number" ? `kr ${n.toFixed(2).replace(".", ",")}` : "—";

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("nb-NO", { day: "2-digit", month: "short", year: "numeric" });
};

const addYears = (iso: string | null, years: number): { date: Date; iso: string } | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const w = new Date(d);
  w.setFullYear(w.getFullYear() + years);
  return { date: w, iso: w.toISOString().slice(0, 10) };
};

const periodStatus = (iso: string | null, years: number) => {
  const w = addYears(iso, years);
  if (!w) return null;
  const now = new Date();
  const daysLeft = Math.floor((w.date.getTime() - now.getTime()) / 86400000);
  return {
    label: w.date.toLocaleDateString("nb-NO", { day: "2-digit", month: "short", year: "numeric" }),
    expired: daysLeft < 0,
    daysLeft,
  };
};

// 5-års reklamasjon (forbrukerkjøpsloven) — beholdt navn for bakoverkompatibilitet
const warrantyDate = (iso: string | null) => addYears(iso, 5);
const warrantyStatus = (iso: string | null) => periodStatus(iso, 5);
// 2-års garanti (produsent/selger sin standardgaranti)
const guaranteeStatus = (iso: string | null) => periodStatus(iso, 2);

const fmtDaysLeft = (d: number) => {
  if (d < 0) return `${Math.abs(d)} d siden`;
  if (d === 0) return "i dag";
  if (d < 60) return `${d} d igjen`;
  if (d < 365) return `${Math.round(d / 30)} mnd igjen`;
  const years = Math.floor(d / 365);
  const months = Math.round((d % 365) / 30);
  return months > 0 ? `${years} år ${months} mnd igjen` : `${years} år igjen`;
};

function KvitteringerPage() {
  const parseFn = useServerFn(parseReceiptImage);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [editing, setEditing] = useState<ReceiptRow | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filterWarrantyActive, setFilterWarrantyActive] = useState(false);
  const [filterWarrantyExpiring, setFilterWarrantyExpiring] = useState(false);
  const [filterDurable, setFilterDurable] = useState(false);
  const [hideFood, setHideFood] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("receipts")
      .select("*")
      .order("purchased_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) toast.error("Kunne ikke laste kvitteringer");
    setReceipts(((data as any[]) ?? []).map((r) => ({ ...r, items: r.items ?? [] })));
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("receipts_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "receipts" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = { ...(payload.new as any), items: (payload.new as any).items ?? [] };
            setReceipts((prev) =>
              prev.some((r) => r.id === row.id) ? prev : [row, ...prev],
            );
          } else if (payload.eventType === "UPDATE") {
            const row = { ...(payload.new as any), items: (payload.new as any).items ?? [] };
            setReceipts((prev) => prev.map((r) => (r.id === row.id ? row : r)));
          } else if (payload.eventType === "DELETE") {
            const id = (payload.old as any).id;
            setReceipts((prev) => prev.filter((r) => r.id !== id));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let okCount = 0;
    const total = files.length;
    let idx = 0;
    for (const file of Array.from(files)) {
      idx += 1;
      const tag = total > 1 ? ` (${idx}/${total})` : "";
      try {
        setUploadStatus(`Laster opp bilde${tag}…`);
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("receipts")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("receipts").getPublicUrl(path);
        const imageUrl = pub.publicUrl;

        setUploadStatus(`AI leser kvitteringen${tag}…`);
        const parsed = await parseFn({ data: { imageUrl } });

        setUploadStatus(`Lagrer i arkivet${tag}…`);
        const { data: inserted, error: insErr } = await supabase
          .from("receipts")
          .insert({
            store: parsed.store,
            purchased_at: parsed.purchased_at,
            total_nok: parsed.total_nok,
            currency: parsed.currency || "NOK",
            items: parsed.items as any,
            ai_raw_text: parsed.raw_text,
            ai_model: parsed.model,
            image_url: imageUrl,
            image_path: path,
            is_food: parsed.is_food ?? false,
            added_by: (() => { const w = getStoredWho(); return w && w !== "Alle" ? w : "Alle"; })(),
            warranty_recipient: (() => { const w = getStoredWho(); return w && w !== "Alle" ? w : "Arne"; })(),
          })
          .select()
          .single();
        if (insErr) throw insErr;
        // Optimistic update — i tilfelle realtime henger
        if (inserted) {
          const row = { ...(inserted as any), items: (inserted as any).items ?? [] };
          setReceipts((prev) =>
            prev.some((r) => r.id === row.id) ? prev : [row, ...prev],
          );
        }
        okCount += 1;
        toast.success(
          `✓ ${parsed.store ?? "Kvittering"}${parsed.total_nok ? ` — kr ${parsed.total_nok.toFixed(2).replace(".", ",")}` : ""} lagt til`,
        );
      } catch (e) {
        console.error(e);
        toast.error(`Kvittering feilet: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setUploading(false);
    setUploadStatus(null);
    if (okCount > 1) toast.success(`Ferdig — ${okCount} kvitteringer lagt til`);
  };

  const removeReceipt = async (r: ReceiptRow) => {
    if (!confirm(`Slette kvittering fra ${r.store ?? "ukjent butikk"}?`)) return;
    // Optimistic remove
    setReceipts((prev) => prev.filter((x) => x.id !== r.id));
    const { error: delErr } = await supabase.from("receipts").delete().eq("id", r.id);
    if (delErr) {
      toast.error("Kunne ikke slette");
      // Restore on failure
      setReceipts((prev) => [r, ...prev].sort((a, b) =>
        (b.purchased_at ?? b.created_at).localeCompare(a.purchased_at ?? a.created_at),
      ));
      return;
    }
    await supabase.storage.from("receipts").remove([r.image_path]);
    toast.success("Kvittering slettet");
  };

  const removeAllFood = async () => {
    const foodReceipts = receipts.filter((r) => r.is_food);
    if (foodReceipts.length === 0) {
      toast.info("Ingen matvarekvitteringer å fjerne");
      return;
    }
    if (
      !confirm(
        `Slette ALLE ${foodReceipts.length} matvarekvittering${foodReceipts.length === 1 ? "" : "er"}? Dette kan ikke angres.`,
      )
    )
      return;
    const ids = foodReceipts.map((r) => r.id);
    const paths = foodReceipts.map((r) => r.image_path);
    setReceipts((prev) => prev.filter((r) => !r.is_food));
    const { error } = await supabase.from("receipts").delete().in("id", ids);
    if (error) {
      toast.error("Kunne ikke slette");
      load();
      return;
    }
    await supabase.storage.from("receipts").remove(paths);
    toast.success(`${ids.length} matvarekvittering${ids.length === 1 ? "" : "er"} slettet`);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return receipts.filter((r) => {
      if (hideFood && r.is_food) return false;
      if (filterDurable) {
        // Varige forbruksgoder: ikke matvarer, har dato, fortsatt innenfor 5-års reklamasjon
        if (r.is_food) return false;
        const w = warrantyStatus(r.purchased_at);
        if (!w || w.expired) return false;
      }
      if (filterWarrantyActive || filterWarrantyExpiring) {
        const w = warrantyStatus(r.purchased_at);
        if (!w || w.expired) return false;
        if (filterWarrantyExpiring && w.daysLeft > 365) return false;
      }
      if (!q) return true;
      if (r.store?.toLowerCase().includes(q)) return true;
      if (r.purchased_at?.includes(q)) return true;
      if (r.purchased_at && fmtDate(r.purchased_at).toLowerCase().includes(q)) return true;
      if (r.ai_raw_text?.toLowerCase().includes(q)) return true;
      if (r.notes?.toLowerCase().includes(q)) return true;
      if (r.items?.some((it) => it.name?.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [receipts, query, filterWarrantyActive, filterWarrantyExpiring, filterDurable, hideFood]);

  return (
    <PageShell>
      <PageHero
        eyebrow="Arkivet"
        title="Kvitterings­krøniken"
        subtitle="Knips, last opp — AI leser butikk, dato og varer for deg."
        image={matvarerImg}
      />

      <section className="container mx-auto px-4 py-8 md:py-12 space-y-8">
        {/* Opplasting */}
        <div className="panel rounded-lg p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-3">
            <ReceiptIcon size={18} className="text-primary" />
            <h2 className="text-display tracking-[0.2em] text-primary text-sm uppercase">
              Ny kvittering
            </h2>
            <div className="h-px flex-1 bg-border" />
          </div>
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5 mb-4">
            <Sparkles size={12} className="text-primary" />
            AI leser automatisk butikk, dato, varer og pris fra bildet.
          </p>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
              className="gap-2"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              Ta bilde av kvittering
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              variant="outline"
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Last opp bilde
            </Button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {uploadStatus && (
            <div className="mt-4 flex items-center gap-2 text-sm text-primary bg-primary/10 border border-primary/20 rounded-md px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span>{uploadStatus}</span>
            </div>
          )}
        </div>

        {/* Søk */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <Search size={18} className="text-primary" />
            <h2 className="text-display tracking-[0.2em] text-primary text-sm uppercase">
              Søk i arkivet
            </h2>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="relative max-w-xl">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Søk på butikk, dato (f.eks. 'okt') eller produkt"
              className="pl-9"
            />
          </div>

          {/* Filter */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <FilterChip
              active={filterWarrantyActive}
              onClick={() => setFilterWarrantyActive((v) => !v)}
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
            >
              Med garanti igjen
            </FilterChip>
            <FilterChip
              active={filterWarrantyExpiring}
              onClick={() => setFilterWarrantyExpiring((v) => !v)}
              icon={<Bell className="h-3.5 w-3.5" />}
            >
              Snart utløp (≤365 dager)
            </FilterChip>
            <FilterChip
              active={filterDurable}
              onClick={() => setFilterDurable((v) => !v)}
              icon={<Package className="h-3.5 w-3.5" />}
              
            >
              Varige forbruksgoder
            </FilterChip>
            <FilterChip
              active={hideFood}
              onClick={() => setHideFood((v) => !v)}
              icon={<Apple className="h-3.5 w-3.5" />}
            >
              Skjul matvarer
            </FilterChip>
            <Button
              size="sm"
              variant="outline"
              onClick={removeAllFood}
              className="gap-1.5 text-destructive hover:text-destructive ml-auto"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Fjern alle matvarer
            </Button>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            {filtered.length} av {receipts.length} kvittering{receipts.length === 1 ? "" : "er"}
          </p>
        </div>

        {/* Liste */}
        {loading ? (
          <p className="text-sm text-muted-foreground italic">Henter arkivet…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            {receipts.length === 0
              ? "Arkivet er tomt. Knips første kvittering!"
              : "Ingen treff på søket."}
          </p>
        ) : (
          <div className="panel rounded-lg divide-y divide-border overflow-hidden">
            {filtered.map((r) => (
              <ReceiptRowItem
                key={r.id}
                receipt={r}
                expanded={expanded.has(r.id)}
                onToggle={() => toggleExpand(r.id)}
                onView={() => setLightbox(r.image_url)}
                onEdit={() => setEditing(r)}
                onDelete={() => removeReceipt(r)}
              />
            ))}
          </div>
        )}
      </section>

      {lightbox && <ImageLightbox url={lightbox} onClose={() => setLightbox(null)} />}
      {editing && (
        <EditDialog
          receipt={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </PageShell>
  );
}

function FilterChip({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
        active
          ? "bg-primary/15 border-primary/50 text-primary"
          : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
      }`}
      aria-pressed={active}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function ReceiptRowItem({
  receipt: r,
  expanded,
  onToggle,
  onView,
  onEdit,
  onDelete,
}: {
  receipt: ReceiptRow;
  expanded: boolean;
  onToggle: () => void;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const itemsTotal = r.items.reduce(
    (sum, it) => sum + (typeof it.total_price === "number" ? it.total_price : 0),
    0,
  );
  const guarantee = guaranteeStatus(r.purchased_at);
  const warranty = warrantyStatus(r.purchased_at);
  return (
    <div className="bg-card">
      {/* Sammendragsrad — klikkbar for å utvide */}
      <div className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-3 text-left flex-1 min-w-0"
          aria-expanded={expanded}
        >
          <div className="shrink-0 text-muted-foreground">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
          <img
            src={r.image_url}
            alt=""
            className="h-10 w-10 rounded object-cover bg-muted/30 shrink-0"
            loading="lazy"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-semibold text-sm sm:text-base truncate flex items-center gap-1.5">
                {r.is_food && (
                  <Apple
                    className="h-3.5 w-3.5 text-emerald-500 shrink-0"
                    aria-label="Matvare"
                  />
                )}
                <span className="truncate">{r.store ?? "Ukjent butikk"}</span>
              </h3>
              <span className="text-xs text-muted-foreground shrink-0">
                Kjøpt {fmtDate(r.purchased_at)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <span className="text-primary font-medium">{fmtPrice(r.total_nok)}</span>
              {r.items.length > 0 && (
                <>
                  <span>·</span>
                  <span className="truncate max-w-[60%]">
                    <span className="text-foreground">{r.items[0].name || "uten navn"}</span>
                    {r.items.length > 1 && (
                      <span> +{r.items.length - 1} til ({r.items.length} varer)</span>
                    )}
                    {r.items.length === 1 && <span> (1 vare)</span>}
                  </span>
                </>
              )}
              {guarantee && !guarantee.expired && (
                <>
                  <span>·</span>
                  <span
                    className={
                      guarantee.daysLeft < 60
                        ? "text-amber-500"
                        : "text-emerald-600 dark:text-emerald-400"
                    }
                    title={`2-års garanti utløper ${guarantee.label}`}
                  >
                    Garanti 2år: {fmtDaysLeft(guarantee.daysLeft)}
                  </span>
                </>
              )}
              {warranty && (
                <>
                  <span>·</span>
                  <span
                    className={
                      warranty.expired
                        ? "text-destructive"
                        : warranty.daysLeft < 90
                          ? "text-amber-500"
                          : "text-muted-foreground"
                    }
                    title={`5-års reklamasjon utløper ${warranty.label}`}
                  >
                    Reklamasjon 5år: {warranty.expired ? "utløpt" : fmtDaysLeft(warranty.daysLeft)}
                  </span>
                </>
              )}
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="shrink-0 p-2 text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10 transition-colors"
          aria-label="Slett kvittering"
          title="Slett kvittering"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Detaljer — vises ved utvidelse */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 grid gap-4 sm:grid-cols-[140px_1fr] border-t border-border/50">
          <button
            type="button"
            onClick={onView}
            className="relative aspect-[3/4] w-full sm:w-[140px] overflow-hidden rounded-md bg-muted/30 group"
            aria-label="Vis kvittering i full størrelse"
          >
            <img
              src={r.image_url}
              alt={`Kvittering ${r.store ?? ""}`}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              loading="lazy"
            />
            <span className="absolute inset-x-0 bottom-0 bg-background/80 text-[10px] text-center py-1 opacity-0 group-hover:opacity-100 transition-opacity">
              Klikk for full størrelse
            </span>
          </button>

          <div className="space-y-3 min-w-0">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-muted/30 rounded px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Kjøpt</div>
                <div className="font-medium">{fmtDate(r.purchased_at)}</div>
              </div>
              <div className="bg-muted/30 rounded px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Garanti (2 år)
                </div>
                <div
                  className={`font-medium ${guarantee?.expired ? "text-muted-foreground line-through" : guarantee && guarantee.daysLeft < 60 ? "text-amber-500" : "text-emerald-600 dark:text-emerald-400"}`}
                >
                  {guarantee?.label ?? "—"}
                </div>
                {guarantee && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {guarantee.expired ? "utløpt" : fmtDaysLeft(guarantee.daysLeft)}
                  </div>
                )}
              </div>
              <div className="bg-muted/30 rounded px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Reklamasjon (5 år)
                </div>
                <div
                  className={`font-medium ${warranty?.expired ? "text-destructive" : warranty && warranty.daysLeft < 90 ? "text-amber-500" : ""}`}
                >
                  {warranty?.label ?? "—"}
                </div>
                {warranty && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {warranty.expired ? "utløpt" : fmtDaysLeft(warranty.daysLeft)}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-2 min-w-0">
                <Bell className="h-3 w-3 text-primary shrink-0" />
                <span className="truncate">
                  Lagt inn av <span className="text-foreground font-medium">{r.added_by || "Ukjent"}</span> · Garanti-varsel til <span className="text-foreground font-medium">{r.warranty_recipient || "Arne"}</span> 90/60/30 dager før utløp
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs shrink-0"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const res = await sendWarrantyTestPush({ data: { receiptId: r.id } });
                    if (res.sent > 0) toast.success(`Test sendt → ${res.recipient}`);
                    else toast.error(`Ingen abonnenter for ${res.recipient}. Abonner i Innstillinger → Push.`);
                  } catch (err) {
                    toast.error("Test feilet: " + (err as Error).message);
                  }
                }}
              >
                <Send className="h-3 w-3 mr-1" /> Test
              </Button>
            </div>
            {r.items.length > 0 ? (

              <div>
                <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                  Varer
                </h4>
                <ul className="text-sm divide-y divide-border/40">
                  {r.items.map((it, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3 py-1">
                      <span className="truncate">
                        {it.name || <em className="text-muted-foreground">uten navn</em>}
                        {typeof it.quantity === "number" && it.quantity !== 1 && (
                          <span className="text-muted-foreground text-xs ml-1.5">
                            × {it.quantity}
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground tabular-nums shrink-0">
                        {fmtPrice(it.total_price)}
                      </span>
                    </li>
                  ))}
                </ul>
                {itemsTotal > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1.5 text-right">
                    Sum varer: {fmtPrice(itemsTotal)}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Ingen varer registrert. Bruk «Rediger» for å legge til.
              </p>
            )}

            {r.notes && (
              <div>
                <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  Notat
                </h4>
                <p className="text-sm whitespace-pre-wrap">{r.notes}</p>
              </div>
            )}

            {r.ai_model && (
              <p className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-primary" />
                Lest av {r.ai_model}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" />
                Rediger
              </Button>
              <Button size="sm" variant="outline" onClick={onView} className="gap-1.5">
                <ReceiptIcon className="h-3.5 w-3.5" />
                Vis bilde
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onDelete}
                className="text-muted-foreground hover:text-destructive ml-auto"
                aria-label="Slett"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-background/80 hover:bg-background"
        aria-label="Lukk"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={url}
        alt="Kvittering full størrelse"
        className="max-w-full max-h-full object-contain rounded-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function EditDialog({
  receipt,
  onClose,
  onSaved,
}: {
  receipt: ReceiptRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [store, setStore] = useState(receipt.store ?? "");
  const [purchasedAt, setPurchasedAt] = useState(receipt.purchased_at ?? "");
  const [total, setTotal] = useState(receipt.total_nok?.toString() ?? "");
  const [items, setItems] = useState<ReceiptItem[]>(receipt.items ?? []);
  const [notes, setNotes] = useState(receipt.notes ?? "");
  const [rawText, setRawText] = useState(receipt.ai_raw_text ?? "");
  const [isFood, setIsFood] = useState<boolean>(receipt.is_food ?? false);
  const [warrantyRecipient, setWarrantyRecipient] = useState<string>(receipt.warranty_recipient ?? "Arne");
  const [saving, setSaving] = useState(false);

  const updateItem = (idx: number, patch: Partial<ReceiptItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const addItem = () =>
    setItems((prev) => [...prev, { name: "", quantity: 1, total_price: null }]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("receipts")
      .update({
        store: store.trim() || null,
        purchased_at: purchasedAt || null,
        total_nok: total ? parseFloat(total.replace(",", ".")) : null,
        items: items as any,
        notes: notes.trim() || null,
        ai_raw_text: rawText,
        is_food: isFood,
        warranty_recipient: warrantyRecipient,
      })
      .eq("id", receipt.id);
    setSaving(false);
    if (error) {
      toast.error("Kunne ikke lagre");
      return;
    }
    toast.success("Lagret");
    onSaved();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-lg shadow-2xl max-w-2xl w-full my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Rediger kvittering</h2>
          <button onClick={onClose} className="p-1 hover:text-primary" aria-label="Lukk">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Label htmlFor="store">Butikk</Label>
              <Input id="store" value={store} onChange={(e) => setStore(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="date">Dato</Label>
              <Input
                id="date"
                type="date"
                value={purchasedAt}
                onChange={(e) => setPurchasedAt(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="total">Totalsum (kr)</Label>
              <Input
                id="total"
                inputMode="decimal"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="recipient" className="inline-flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5 text-primary" />
                Garanti-varsel til
              </Label>
              <select
                id="recipient"
                value={warrantyRecipient}
                onChange={(e) => setWarrantyRecipient(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {WHO_OPTIONS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Push 90, 60 og 30 dager før utløp.
              </p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isFood}
              onChange={(e) => setIsFood(e.target.checked)}
              className="rounded border-input"
            />
            <Apple className="h-3.5 w-3.5 text-muted-foreground" />
            Matvarekvittering (telles med i «Fjern alle matvarer»)
          </label>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Varer ({items.length})</Label>
              <Button size="sm" variant="outline" onClick={addItem} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Legg til
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <Input
                    placeholder="Navn"
                    value={it.name}
                    onChange={(e) => updateItem(idx, { name: e.target.value })}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Antall"
                    inputMode="decimal"
                    value={it.quantity ?? ""}
                    onChange={(e) =>
                      updateItem(idx, {
                        quantity: e.target.value ? parseFloat(e.target.value.replace(",", ".")) : null,
                      })
                    }
                    className="w-20"
                  />
                  <Input
                    placeholder="Pris"
                    inputMode="decimal"
                    value={it.total_price ?? ""}
                    onChange={(e) =>
                      updateItem(idx, {
                        total_price: e.target.value
                          ? parseFloat(e.target.value.replace(",", "."))
                          : null,
                      })
                    }
                    className="w-24"
                  />
                  <button
                    onClick={() => removeItem(idx)}
                    className="p-2 text-muted-foreground hover:text-destructive"
                    aria-label="Fjern"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notater</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="raw">AI-tekst (rå)</Label>
            <Textarea
              id="raw"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={4}
              className="font-mono text-xs"
            />
            {receipt.ai_model && (
              <p className="text-[10px] text-muted-foreground mt-1 inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-primary" />
                Lest av {receipt.ai_model}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>
            Avbryt
          </Button>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Lagre
          </Button>
        </div>
      </div>
    </div>
  );
}
