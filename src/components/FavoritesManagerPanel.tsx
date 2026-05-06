import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, ChevronDown, ChevronUp, Pencil, Save, X, Globe } from "lucide-react";
import { ICON_NAMES, getIcon, getIconColor, faviconUrl, FAVICON_ICON } from "@/lib/web-favorite-icons";
import { getNameForCurrentIp } from "@/server/user-locations";
import { getStoredWho } from "@/lib/push-client";

type Row = {
  id: string;
  who: string;
  label: string;
  url: string;
  icon: string;
  sort_order: number;
};

export function FavoritesManagerPanel() {
  const fetchName = useServerFn(getNameForCurrentIp);
  const [who, setWho] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [icon, setIcon] = useState(FAVICON_ICON);
  const [scope, setScope] = useState<"me" | "all">("me");
  const [iconOpen, setIconOpen] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editIcon, setEditIcon] = useState(FAVICON_ICON);
  const [editScope, setEditScope] = useState<"me" | "all">("me");
  const [editIconOpen, setEditIconOpen] = useState(false);

  useEffect(() => {
    // Primær: bruk navnet på push-mottakeren lagret på denne enheten.
    const stored = getStoredWho();
    if (stored && stored !== "Alle") {
      setWho(stored);
      return;
    }
    // Fallback: IP-oppslag
    fetchName().then((r) => { if (r?.who) setWho(r.who); }).catch(() => {});
  }, [fetchName]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("web_favorites")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!label.trim() || !url.trim()) return;
    if (scope === "me" && !who) {
      alert("Kunne ikke finne navnet ditt på denne IP-en. Velg 'Felles' eller logg inn først.");
      return;
    }
    const target = scope === "all" ? "Alle" : who;
    let normUrl = url.trim();
    if (!/^https?:\/\//i.test(normUrl)) normUrl = "https://" + normUrl;
    await supabase.from("web_favorites").insert({
      who: target, label: label.trim(), url: normUrl, icon,
    });
    setLabel(""); setUrl(""); setIcon(FAVICON_ICON); setIconOpen(false);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("web_favorites").delete().eq("id", id);
    load();
  };

  const startEdit = (r: Row) => {
    setEditingId(r.id);
    setEditLabel(r.label);
    setEditUrl(r.url);
    setEditIcon(r.icon || FAVICON_ICON);
    setEditScope(r.who === "Alle" ? "all" : "me");
    setEditIconOpen(false);
  };
  const saveEdit = async () => {
    if (!editingId) return;
    let normUrl = editUrl.trim();
    if (!/^https?:\/\//i.test(normUrl)) normUrl = "https://" + normUrl;
    if (editScope === "me" && !who) {
      alert("Kunne ikke finne navnet ditt på denne IP-en.");
      return;
    }
    const target = editScope === "all" ? "Alle" : who;
    await supabase.from("web_favorites").update({
      label: editLabel.trim(), url: normUrl, icon: editIcon, who: target,
    }).eq("id", editingId);
    setEditingId(null);
    load();
  };

  const mine = rows.filter((r) => r.who === who);
  const felles = rows.filter((r) => r.who === "Alle");

  return (
    <section className="container mx-auto px-4 pt-4">
      <article className="panel rounded-lg p-4">
        <h3 className="text-foreground font-semibold flex items-center gap-2">
          <Globe size={18} className="text-primary" /> Favoritter — nettsidesnarveier
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Snarveier som vises i menyen øverst. For deg ({who || "ukjent — logg inn"}) eller felles for alle.
        </p>
        {!who && (
          <p className="text-xs text-amber-500 mt-1">
            Vi finner ikke navnet ditt på denne IP-en, så «Bare meg» er deaktivert. Logg inn / sett navn først.
          </p>
        )}

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Navn (f.eks. NRK)"
            className="px-3 py-2 rounded bg-background border border-border text-sm"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="px-3 py-2 rounded bg-background border border-border text-sm"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs">
            <input type="radio" checked={scope === "me"} onChange={() => setScope("me")} />
            Bare meg ({who})
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="radio" checked={scope === "all"} onChange={() => setScope("all")} />
            Felles (alle)
          </label>
        </div>

        <IconPicker
          open={iconOpen}
          setOpen={setIconOpen}
          icon={icon}
          setIcon={setIcon}
          url={url}
        />

        <button
          onClick={add}
          className="mt-3 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground"
        >
          <Plus size={14} /> Legg til
        </button>

        {loading ? (
          <div className="mt-4 text-sm text-muted-foreground">Laster…</div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <FavList title={`Mine (${who})`} rows={mine}
              onRemove={remove} onEdit={startEdit}
              editingId={editingId} editLabel={editLabel} setEditLabel={setEditLabel}
              editUrl={editUrl} setEditUrl={setEditUrl}
              editIcon={editIcon} setEditIcon={setEditIcon}
              editScope={editScope} setEditScope={setEditScope}
              editIconOpen={editIconOpen} setEditIconOpen={setEditIconOpen}
              onSave={saveEdit} onCancel={() => setEditingId(null)} who={who} />
            <FavList title="Felles (alle)" rows={felles}
              onRemove={remove} onEdit={startEdit}
              editingId={editingId} editLabel={editLabel} setEditLabel={setEditLabel}
              editUrl={editUrl} setEditUrl={setEditUrl}
              editIcon={editIcon} setEditIcon={setEditIcon}
              editScope={editScope} setEditScope={setEditScope}
              editIconOpen={editIconOpen} setEditIconOpen={setEditIconOpen}
              onSave={saveEdit} onCancel={() => setEditingId(null)} who={who} />
          </div>
        )}
      </article>
    </section>
  );
}

function IconPicker({ open, setOpen, icon, setIcon, url }: {
  open: boolean; setOpen: (v: boolean) => void; icon: string; setIcon: (v: string) => void; url: string;
}) {
  const fav = url ? faviconUrl(url, 32) : null;
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded border border-border hover:bg-muted"
      >
        <IconPreview icon={icon} url={url} size={14} />
        <span>Ikon: {icon === FAVICON_ICON ? "Nettsidens favicon" : icon}</span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 gap-1.5 p-2 border border-border rounded bg-background/50 max-h-72 overflow-auto">
          <button
            type="button"
            onClick={() => { setIcon(FAVICON_ICON); setOpen(false); }}
            title="Bruk nettsidens favicon"
            className={`p-2 rounded border flex items-center justify-center ${icon === FAVICON_ICON ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-primary"}`}
          >
            {fav ? <img src={fav} alt="" className="w-4 h-4" /> : <Globe size={16} />}
          </button>
          {ICON_NAMES.map((n) => {
            const I = getIcon(n);
            const c = getIconColor(n);
            const active = n === icon;
            return (
              <button
                key={n}
                type="button"
                onClick={() => { setIcon(n); setOpen(false); }}
                title={n}
                className={`p-2 rounded border ${active ? "border-primary" : "border-border hover:border-primary/60"}`}
              >
                <I size={16} color={c} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IconPreview({ icon, url, size = 14 }: { icon: string; url?: string; size?: number }) {
  if (icon === FAVICON_ICON) {
    const f = url ? faviconUrl(url, 32) : null;
    if (f) return <img src={f} alt="" style={{ width: size, height: size }} />;
    return <Globe size={size} />;
  }
  const I = getIcon(icon);
  const c = getIconColor(icon);
  return <I size={size} color={c} />;
}

type FavListProps = {
  title: string; rows: Row[];
  onRemove: (id: string) => void;
  onEdit: (r: Row) => void;
  editingId: string | null;
  editLabel: string; setEditLabel: (v: string) => void;
  editUrl: string; setEditUrl: (v: string) => void;
  editIcon: string; setEditIcon: (v: string) => void;
  editScope: "me" | "all"; setEditScope: (v: "me" | "all") => void;
  editIconOpen: boolean; setEditIconOpen: (v: boolean) => void;
  onSave: () => void; onCancel: () => void;
  who: string;
};

function FavList(p: FavListProps) {
  return (
    <div className="rounded-lg border border-border bg-card/30 p-3">
      <h4 className="text-xs tracking-widest uppercase text-primary mb-2">{p.title}</h4>
      {p.rows.length === 0 && <div className="text-xs text-muted-foreground">Ingen snarveier ennå.</div>}
      <ul className="flex flex-col gap-1.5">
        {p.rows.map((r) => {
          const isEdit = p.editingId === r.id;
          if (isEdit) {
            return (
              <li key={r.id} className="border border-border rounded p-2 flex flex-col gap-2 bg-background/40">
                <input value={p.editLabel} onChange={(e) => p.setEditLabel(e.target.value)} className="px-2 py-1 rounded bg-background border border-border text-xs" />
                <input value={p.editUrl} onChange={(e) => p.setEditUrl(e.target.value)} className="px-2 py-1 rounded bg-background border border-border text-xs" />
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <label className="flex items-center gap-1">
                    <input type="radio" checked={p.editScope === "me"} onChange={() => p.setEditScope("me")} />Meg ({p.who})
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="radio" checked={p.editScope === "all"} onChange={() => p.setEditScope("all")} />Felles
                  </label>
                </div>
                <IconPicker open={p.editIconOpen} setOpen={p.setEditIconOpen} icon={p.editIcon} setIcon={p.setEditIcon} url={p.editUrl} />
                <div className="flex gap-2 flex-wrap">
                  <button onClick={p.onSave} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary text-primary-foreground">
                    <Save size={12} /> Lagre
                  </button>
                  <button onClick={p.onCancel} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border">
                    <X size={12} /> Avbryt
                  </button>
                  <button
                    onClick={() => { if (confirm("Slette snarvei?")) { p.onRemove(r.id); p.onCancel(); } }}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-destructive text-destructive ml-auto"
                  >
                    <Trash2 size={12} /> Slett
                  </button>
                </div>
              </li>
            );
          }
          return (
            <li key={r.id} className="flex items-center gap-2 border border-border rounded px-2 py-1.5">
              <IconPreview icon={r.icon} url={r.url} size={14} />
              <a href={r.url} target="_blank" rel="noreferrer" className="flex-1 text-sm hover:text-primary truncate">
                {r.label}
              </a>
              <button onClick={() => p.onEdit(r)} className="text-muted-foreground hover:text-primary p-1" title="Rediger">
                <Pencil size={12} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
