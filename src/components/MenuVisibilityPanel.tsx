import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  MENU_LINK_DEFS,
  useMenuVisibility,
  saveMenuVisibility,
  isMenuLinkVisible,
  DEFAULT_MENU_VISIBILITY,
  type MenuVisibility,
} from "@/hooks/use-menu-visibility";

export function MenuVisibilityPanel() {
  const remote = useMenuVisibility();
  const [draft, setDraft] = useState<MenuVisibility>(remote);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(remote); }, [remote]);

  const toggle = async (to: string, next: boolean) => {
    if (to === "/") return; // Hjem er alltid synlig
    const updated = { ...draft, [to]: next };
    setDraft(updated);
    setSaving(true);
    try {
      await saveMenuVisibility(updated);
    } finally {
      setSaving(false);
    }
  };

  const visibleCount = MENU_LINK_DEFS.filter((l) => isMenuLinkVisible(draft, l.to)).length;

  return (
    <section className="container mx-auto px-4 pt-4">
      <article className="panel rounded-lg p-4">
        <h3 className="text-foreground font-semibold flex items-center gap-2">
          <Eye size={18} className="text-primary" /> Topp-meny — synlige sider
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Velg hvilke sider som skal vises i topp-menyen. Innstillingen er global og
          gjelder for alle brukere. Hjem er alltid på.
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">
          {visibleCount} av {MENU_LINK_DEFS.length} sider synlige{saving ? " · lagrer …" : ""}
        </p>

        <ul className="mt-3 grid sm:grid-cols-2 gap-2">
          {MENU_LINK_DEFS.map((l) => {
            const on = isMenuLinkVisible(draft, l.to);
            const locked = l.to === "/";
            return (
              <li key={l.to}>
                <label
                  className={`flex items-center justify-between gap-2 text-sm panel rounded p-3 border ${
                    on ? "border-border/60" : "border-border/30 opacity-70"
                  } ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <span className="flex items-center gap-2">
                    {on ? (
                      <Eye size={14} className="text-primary" />
                    ) : (
                      <EyeOff size={14} className="text-muted-foreground" />
                    )}
                    <span className="text-foreground">{l.label}</span>
                    <span className="text-[10px] text-muted-foreground/70">{l.to}</span>
                    {locked && (
                      <span className="text-[10px] uppercase tracking-wider text-primary/70">låst</span>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={locked}
                    onChange={(e) => toggle(l.to, e.target.checked)}
                    className="accent-primary"
                  />
                </label>
              </li>
            );
          })}
        </ul>
      </article>
    </section>
  );
}
