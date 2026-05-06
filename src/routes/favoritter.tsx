import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { Plus, Trash2, ChevronDown, ChevronUp, Globe, Pencil, Save, X } from "lucide-react";
import { ICON_NAMES, getIcon } from "@/lib/web-favorite-icons";
import { getNameForCurrentIp } from "@/server/user-locations";

export const Route = createFileRoute("/favoritter")({
  head: () => ({
    meta: [
      { title: "Favoritter — nettsidesnarveier | House Pettersen Riis" },
      { name: "description", content: "Lagre snarveier til nettsider per bruker eller felles for alle." },
    ],
  }),
  component: FavoritterPage,
});

type Row = {
  id: string;
  who: string;
  label: string;
  url: string;
  icon: string;
  sort_order: number;
};

function FavoritterPage() {
  const fetchName = useServerFn(getNameForCurrentIp);
  const [who, setWho] = useState<string>("Alle");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  // form
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [icon, setIcon] = useState("Globe");
  const [scope, setScope] = useState<"me" | "all">("me");
  const [iconOpen, setIconOpen] = useState(false);

  // edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editIcon, setEditIcon] = useState("Globe");
  const [editScope, setEditScope] = useState<"me" | "all">("me");
  const [editIconOpen, setEditIconOpen] = useState(false);

  useEffect(() => {
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
    const target = scope === "all" ? "Alle" : (who || "Alle");
    let normUrl = url.trim();
    if (!/^https?:\/\//i.test(normUrl)) normUrl = "https://" + normUrl;
    await supabase.from("web_favorites").insert({
      who: target, label: label.trim(), url: normUrl, icon,
    });
    setLabel(""); setUrl(""); setIcon("Globe"); setIconOpen(false);
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
    setEditIcon(r.icon);
    setEditScope(r.who === "Alle" ? "all" : "me");
    setEditIconOpen(false);
  };
  const saveEdit = async () => {
    if (!editingId) return;
    let normUrl = editUrl.trim();
    if (!/^https?:\/\//i.test(normUrl)) normUrl = "https://" + normUrl;
    const target = editScope === "all" ? "Alle" : (who || "Alle");
    await supabase.from("web_favorites").update({
      label: editLabel.trim(), url: normUrl, icon: editIcon, who: target,
    }).eq("id", editingId);
    setEditingId(null);
    load();
  };

  const mine = rows.filter((r) => r.who === who);
  const felles = rows.filter((r) => r.who === "Alle");

  return (
    <PageShell>
      <PageHero
        eyebrow="Snarveier"
        title="Favoritter"
        subtitle={`Lagre nettsidesnarveier for deg (${who}) eller felles for alle.`}
      />

      <section className="rounded-lg border border-border bg-card/50 p-4 mb-6">
        <h2 className="text-sm tracking-widest uppercase text-primary mb-3">Legg til snarvei</h2>
        <div className="grid gap-3 md:grid-cols-2">
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
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs">
            <input type="radio" checked={scope === "me"} onChange={() => setScope("me")} />
            Bare meg ({who})
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="radio" checked={scope === "all"} onChange={() => setScope("all")} />
            Felles (alle)
          </label>
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={() => setIconOpen((v) => !v)}
            className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded border border-border hover:bg-muted"
          >
            {(() => { const I = getIcon(icon); return <I size={14} />; })()}
            <span>Ikon: {icon}</span>
            {iconOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {iconOpen && (
            <div className="mt-2 grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 gap-1.5 p-2 border border-border rounded bg-background/50 max-h-64 overflow-auto">
              {ICON_NAMES.map((n) => {
                const I = getIcon(n);
                const active = n === icon;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => { setIcon(n); setIconOpen(false); }}
                    title={n}
                    className={`p-2 rounded border ${active ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-primary"}`}
                  >
                    <I size={16} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={add}
          className="mt-3 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground"
        >
          <Plus size={14} /> Legg til
        </button>
      </section>

      {loading ? (
        <div className="text-sm text-muted-foreground">Laster…</div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
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
    </PageShell>
  );
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
    <div className="rounded-lg border border-border bg-card/30 p-4">
      <h3 className="text-sm tracking-widest uppercase text-primary mb-3">{p.title}</h3>
      {p.rows.length === 0 && <div className="text-xs text-muted-foreground">Ingen snarveier ennå.</div>}
      <ul className="flex flex-col gap-1.5">
        {p.rows.map((r) => {
          const I = getIcon(r.icon);
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
                <button type="button" onClick={() => p.setEditIconOpen(!p.editIconOpen)}
                  className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded border border-border self-start">
                  {(() => { const EI = getIcon(p.editIcon); return <EI size={12} />; })()}
                  <span>{p.editIcon}</span>
                  {p.editIconOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                </button>
                {p.editIconOpen && (
                  <div className="grid grid-cols-8 gap-1 p-2 border border-border rounded bg-background/50 max-h-48 overflow-auto">
                    {ICON_NAMES.map((n) => {
                      const EI = getIcon(n);
                      return (
                        <button key={n} type="button" onClick={() => { p.setEditIcon(n); p.setEditIconOpen(false); }}
                          className={`p-1.5 rounded border ${n === p.editIcon ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                          <EI size={14} />
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={p.onSave} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary text-primary-foreground">
                    <Save size={12} /> Lagre
                  </button>
                  <button onClick={p.onCancel} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border">
                    <X size={12} /> Avbryt
                  </button>
                </div>
              </li>
            );
          }
          return (
            <li key={r.id} className="flex items-center gap-2 border border-border rounded px-2 py-1.5">
              <I size={14} className="text-primary shrink-0" />
              <a href={r.url} target="_blank" rel="noreferrer" className="flex-1 text-sm hover:text-primary truncate">
                {r.label}
              </a>
              <button onClick={() => p.onEdit(r)} className="text-muted-foreground hover:text-primary p-1" title="Rediger">
                <Pencil size={12} />
              </button>
              <button onClick={() => p.onRemove(r.id)} className="text-muted-foreground hover:text-destructive p-1" title="Slett">
                <Trash2 size={12} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
