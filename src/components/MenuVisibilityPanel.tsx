import { useEffect, useState } from "react";
import { Eye, EyeOff, Users } from "lucide-react";
import {
  MENU_LINK_DEFS,
  MENU_USERS,
  useMenuVisibility,
  saveMenuVisibility,
  isMenuLinkVisible,
  getMenuLinkState,
  type MenuVisibility,
} from "@/hooks/use-menu-visibility";

export function MenuVisibilityPanel() {
  const remote = useMenuVisibility();
  const [draft, setDraft] = useState<MenuVisibility>(remote);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(remote); }, [remote]);

  const persist = async (next: MenuVisibility) => {
    setDraft(next);
    setSaving(true);
    try {
      await saveMenuVisibility(next);
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = (to: string, next: boolean) => {
    if (to === "/") return;
    const cur = getMenuLinkState(draft, to);
    void persist({ ...draft, [to]: { ...cur, enabled: next } });
  };

  const toggleUser = (to: string, user: string) => {
    if (to === "/") return;
    const cur = getMenuLinkState(draft, to);
    const has = cur.users.includes(user);
    const users = has ? cur.users.filter((u) => u !== user) : [...cur.users, user];
    void persist({ ...draft, [to]: { ...cur, users } });
  };

  const setAllUsers = (to: string) => {
    if (to === "/") return;
    const cur = getMenuLinkState(draft, to);
    void persist({ ...draft, [to]: { ...cur, users: [] } });
  };

  const visibleCount = MENU_LINK_DEFS.filter((l) => isMenuLinkVisible(draft, l.to)).length;

  return (
    <section className="container mx-auto px-4 pt-4">
      <article className="panel rounded-lg p-4">
        <h3 className="text-foreground font-semibold flex items-center gap-2">
          <Eye size={18} className="text-primary" /> Topp-meny — synlige sider
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Velg hvilke sider som skal vises i topp-menyen og Husets saler. Du kan
          også begrense en side til spesifikke brukere — la «Alle» stå på for å
          vise for alle. Hjem er alltid på.
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">
          {visibleCount} av {MENU_LINK_DEFS.length} sider synlige{saving ? " · lagrer …" : ""}
        </p>

        <ul className="mt-3 grid sm:grid-cols-2 gap-2">
          {MENU_LINK_DEFS.map((l) => {
            const st = getMenuLinkState(draft, l.to);
            const on = isMenuLinkVisible(draft, l.to);
            const locked = l.to === "/";
            const allUsers = !st.users || st.users.length === 0;
            return (
              <li key={l.to}>
                <div
                  className={`panel rounded p-3 border ${
                    on ? "border-border/60" : "border-border/30 opacity-70"
                  }`}
                >
                  <label className={`flex items-center justify-between gap-2 text-sm ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}>
                    <span className="flex items-center gap-2 min-w-0">
                      {on ? (
                        <Eye size={14} className="text-primary shrink-0" />
                      ) : (
                        <EyeOff size={14} className="text-muted-foreground shrink-0" />
                      )}
                      <span className="text-foreground truncate">{l.label}</span>
                      <span className="text-[10px] text-muted-foreground/70 truncate">{l.to}</span>
                      {locked && (
                        <span className="text-[10px] uppercase tracking-wider text-primary/70">låst</span>
                      )}
                    </span>
                    <input
                      type="checkbox"
                      checked={st.enabled}
                      disabled={locked}
                      onChange={(e) => toggleEnabled(l.to, e.target.checked)}
                      className="accent-primary"
                    />
                  </label>

                  {!locked && st.enabled && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <Users size={12} className="text-muted-foreground" />
                      <button
                        type="button"
                        onClick={() => setAllUsers(l.to)}
                        className={`text-[11px] px-2 py-0.5 rounded border ${
                          allUsers
                            ? "border-primary/60 bg-primary/15 text-primary"
                            : "border-border/40 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Alle
                      </button>
                      {MENU_USERS.map((u) => {
                        const active = !allUsers && st.users.includes(u);
                        return (
                          <button
                            key={u}
                            type="button"
                            onClick={() => toggleUser(l.to, u)}
                            className={`text-[11px] px-2 py-0.5 rounded border ${
                              active
                                ? "border-primary/60 bg-primary/15 text-primary"
                                : "border-border/40 text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {u}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </article>
    </section>
  );
}
