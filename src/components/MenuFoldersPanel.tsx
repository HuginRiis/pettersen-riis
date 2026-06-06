import { useState } from "react";
import { FolderPlus, Folder, Trash2, ArrowUp, ArrowDown, Pencil, Check, X, ArrowUpToLine, ArrowDownToLine } from "lucide-react";
import { useMenuPrefs } from "@/hooks/use-menu-prefs";
import { MENU_LINK_DEFS } from "@/hooks/use-menu-visibility";

const ALL_LINKS = MENU_LINK_DEFS.filter((l) => l.to !== "/");

export function MenuFoldersPanel() {
  const {
    prefs,
    addMenuFolder,
    renameMenuFolder,
    deleteMenuFolder,
    setMenuFolderPosition,
    toggleMenuFolderItem,
    moveMenuFolder,
  } = useMenuPrefs();

  const folders = prefs.menuFolders ?? [];

  const [newName, setNewName] = useState("");
  const [newPos, setNewPos] = useState<"top" | "bottom">("top");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    addMenuFolder(name, newPos);
    setNewName("");
  };

  // Pages already assigned to ANOTHER folder — informative chip per item.
  const folderByPath = new Map<string, string>();
  for (const f of folders) for (const p of f.items) folderByPath.set(p, f.id);

  return (
    <section className="container mx-auto px-4 pt-4">
      <article className="panel rounded-lg p-4">
        <h3 className="text-foreground font-semibold flex items-center gap-2">
          <Folder size={18} className="text-primary" /> Kataloger i topp-menyen
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Lag egne kataloger og legg menysider inn i dem. Velg om katalogen skal
          ligge øverst eller nederst i topp-menyen. En side kan bare ligge i én
          katalog om gangen.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2 panel rounded p-3 border border-border/50">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Navn på ny katalog"
            className="flex-1 min-w-[180px] bg-background/60 border border-border/50 rounded px-2 py-1 text-sm"
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          />
          <div className="flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => setNewPos("top")}
              className={`px-2 py-1 rounded border ${
                newPos === "top"
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="inline-flex items-center gap-1"><ArrowUpToLine size={12} /> Topp</span>
            </button>
            <button
              type="button"
              onClick={() => setNewPos("bottom")}
              className={`px-2 py-1 rounded border ${
                newPos === "bottom"
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="inline-flex items-center gap-1"><ArrowDownToLine size={12} /> Bunn</span>
            </button>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="px-3 py-1 rounded text-xs bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-1"
          >
            <FolderPlus size={13} /> Lag katalog
          </button>
        </div>

        {folders.length === 0 && (
          <p className="text-xs text-muted-foreground mt-3 italic">
            Ingen kataloger ennå. Lag en over for å starte.
          </p>
        )}

        <ul className="mt-4 space-y-3">
          {folders.map((f, idx) => {
            const isEditing = editingId === f.id;
            return (
              <li key={f.id} className="panel rounded border border-border/60 p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Folder size={14} className="text-primary shrink-0" />
                  {isEditing ? (
                    <>
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 min-w-[140px] bg-background/60 border border-border/50 rounded px-2 py-0.5 text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            renameMenuFolder(f.id, editingName);
                            setEditingId(null);
                          } else if (e.key === "Escape") {
                            setEditingId(null);
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => { renameMenuFolder(f.id, editingName); setEditingId(null); }}
                        className="p-1 text-primary hover:opacity-80"
                        aria-label="Lagre navn"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="p-1 text-muted-foreground hover:text-foreground"
                        aria-label="Avbryt"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-foreground font-medium flex-1 truncate">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => { setEditingId(f.id); setEditingName(f.name); }}
                        className="p-1 text-muted-foreground hover:text-primary"
                        aria-label="Endre navn"
                        title="Endre navn"
                      >
                        <Pencil size={13} />
                      </button>
                    </>
                  )}

                  <div className="flex items-center gap-1 text-[11px] ml-auto">
                    <button
                      type="button"
                      onClick={() => setMenuFolderPosition(f.id, "top")}
                      className={`px-2 py-0.5 rounded border ${
                        f.position === "top"
                          ? "border-primary/60 bg-primary/15 text-primary"
                          : "border-border/40 text-muted-foreground hover:text-foreground"
                      }`}
                      title="Plasser øverst i menyen"
                    >
                      <span className="inline-flex items-center gap-1"><ArrowUpToLine size={11} /> Topp</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMenuFolderPosition(f.id, "bottom")}
                      className={`px-2 py-0.5 rounded border ${
                        f.position === "bottom"
                          ? "border-primary/60 bg-primary/15 text-primary"
                          : "border-border/40 text-muted-foreground hover:text-foreground"
                      }`}
                      title="Plasser nederst i menyen"
                    >
                      <span className="inline-flex items-center gap-1"><ArrowDownToLine size={11} /> Bunn</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => moveMenuFolder(f.id, -1)}
                      disabled={idx === 0}
                      className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="Flytt opp"
                      title="Flytt opp"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveMenuFolder(f.id, 1)}
                      disabled={idx === folders.length - 1}
                      className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="Flytt ned"
                      title="Flytt ned"
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Slette katalogen «${f.name}»?`)) deleteMenuFolder(f.id);
                      }}
                      className="p-1 text-destructive/80 hover:text-destructive"
                      aria-label="Slett katalog"
                      title="Slett katalog"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground mt-2">
                  {f.items.length} side{f.items.length === 1 ? "" : "r"} i katalogen
                </p>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ALL_LINKS.map((l) => {
                    const inThis = f.items.includes(l.to);
                    const otherId = folderByPath.get(l.to);
                    const inOther = !!otherId && otherId !== f.id;
                    return (
                      <button
                        key={l.to}
                        type="button"
                        onClick={() => toggleMenuFolderItem(f.id, l.to)}
                        className={`px-2 py-0.5 rounded-full text-[11px] border transition flex items-center gap-1 ${
                          inThis
                            ? "bg-primary text-primary-foreground border-primary"
                            : inOther
                              ? "border-border/30 text-muted-foreground/50 hover:border-border"
                              : "border-border text-muted-foreground hover:bg-accent/40"
                        }`}
                        title={inOther ? "Ligger allerede i en annen katalog — klikk for å flytte hit" : undefined}
                      >
                        {l.label}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      </article>
    </section>
  );
}
