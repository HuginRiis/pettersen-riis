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
} from "lucide-react";
import { PageShell, PageHero } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { parseReceiptImage, type ReceiptItem } from "@/server/receipt-ai";
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
};

const fmtPrice = (n: number | null | undefined) =>
  typeof n === "number" ? `kr ${n.toFixed(2).replace(".", ",")}` : "—";

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("nb-NO", { day: "2-digit", month: "short", year: "numeric" });
};

function KvitteringerPage() {
  const parseFn = useServerFn(parseReceiptImage);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [editing, setEditing] = useState<ReceiptRow | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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
      .on("postgres_changes", { event: "*", schema: "public", table: "receipts" }, () => load())
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
    for (const file of Array.from(files)) {
      try {
        // 1. Upload to storage
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("receipts")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("receipts").getPublicUrl(path);
        const imageUrl = pub.publicUrl;

        // 2. AI parse
        toast.info("AI leser kvitteringen…");
        const parsed = await parseFn({ data: { imageUrl } });

        // 3. Insert
        const { error: insErr } = await supabase.from("receipts").insert({
          store: parsed.store,
          purchased_at: parsed.purchased_at,
          total_nok: parsed.total_nok,
          currency: parsed.currency || "NOK",
          items: parsed.items as any,
          ai_raw_text: parsed.raw_text,
          ai_model: parsed.model,
          image_url: imageUrl,
          image_path: path,
        });
        if (insErr) throw insErr;
        okCount += 1;
      } catch (e) {
        console.error(e);
        toast.error(`Kvittering feilet: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setUploading(false);
    if (okCount > 0) toast.success(`Lagret ${okCount} kvittering${okCount === 1 ? "" : "er"}`);
  };

  const removeReceipt = async (r: ReceiptRow) => {
    if (!confirm(`Slette kvittering fra ${r.store ?? "ukjent butikk"}?`)) return;
    const { error: delErr } = await supabase.from("receipts").delete().eq("id", r.id);
    if (delErr) {
      toast.error("Kunne ikke slette");
      return;
    }
    await supabase.storage.from("receipts").remove([r.image_path]);
    toast.success("Kvittering slettet");
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return receipts;
    return receipts.filter((r) => {
      if (r.store?.toLowerCase().includes(q)) return true;
      if (r.purchased_at?.includes(q)) return true;
      if (r.purchased_at && fmtDate(r.purchased_at).toLowerCase().includes(q)) return true;
      if (r.ai_raw_text?.toLowerCase().includes(q)) return true;
      if (r.notes?.toLowerCase().includes(q)) return true;
      if (r.items?.some((it) => it.name?.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [receipts, query]);

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
          <p className="mt-2 text-xs text-muted-foreground">
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((r) => (
              <ReceiptCard
                key={r.id}
                receipt={r}
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

function ReceiptCard({
  receipt: r,
  onView,
  onEdit,
  onDelete,
}: {
  receipt: ReceiptRow;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="panel rounded-lg p-4 flex flex-col gap-3">
      <button
        type="button"
        onClick={onView}
        className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-muted/30 group"
      >
        <img
          src={r.image_url}
          alt={`Kvittering ${r.store ?? ""}`}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          loading="lazy"
        />
      </button>
      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-semibold text-base truncate">{r.store ?? "Ukjent butikk"}</h3>
          <span className="text-xs text-muted-foreground shrink-0">{fmtDate(r.purchased_at)}</span>
        </div>
        <div className="text-sm text-primary font-medium">{fmtPrice(r.total_nok)}</div>
        {r.items.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {r.items.length} vare{r.items.length === 1 ? "" : "r"}
            {r.items.slice(0, 3).length > 0 && (
              <>: {r.items.slice(0, 3).map((i) => i.name).join(", ")}
                {r.items.length > 3 && "…"}
              </>
            )}
          </p>
        )}
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5 flex-1">
          <Pencil className="h-3.5 w-3.5" />
          Rediger
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Slett"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
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
          <div>
            <Label htmlFor="total">Totalsum (kr)</Label>
            <Input
              id="total"
              inputMode="decimal"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              className="max-w-[200px]"
            />
          </div>

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
