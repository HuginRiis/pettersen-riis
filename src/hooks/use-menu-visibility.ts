import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const MENU_USERS = ["Arne", "Rebekka", "Nora"] as const;
export type MenuUser = (typeof MENU_USERS)[number];

/**
 * Per-link visibility state.
 * - `enabled: false` skjuler lenken for alle.
 * - `users` er en allow-list. Tom liste = synlig for alle brukere.
 *   Ellers vises lenken kun for navngitte brukere (samt "anon"/uautentiserte
 *   håndteres separat via `public`-flagget på lenken).
 */
export type MenuLinkState = { enabled: boolean; users: string[] };
export type MenuVisibility = Record<string, MenuLinkState>;

export const MENU_VISIBILITY_KEY = "menu_visibility";

// Alle ruter som kan vises i topp-menyen. Holdes synkron med navLinks i SiteHeader
// og med "Husets saler" i src/routes/index.tsx.
export const MENU_LINK_DEFS: { to: string; label: string }[] = [
  { to: "/", label: "Hjem" },
  { to: "/var", label: "Vær" },
  { to: "/pollen", label: "Luftkvalitet" },
  { to: "/turer", label: "Ferden" },
  { to: "/agenda", label: "Søppel, bursdager og meldinger" },
  { to: "/push-varslinger", label: "Innstillinger" },
  { to: "/vakttarnet", label: "Vakttårnet" },
  { to: "/ytelse", label: "Ytelse" },
  { to: "/hytta", label: "Hytta" },
  { to: "/smarthus", label: "Smarthus" },
  { to: "/smart-dashbord", label: "Smart dashbord" },
  { to: "/lys", label: "Lys" },
  { to: "/varme", label: "Varme & Klima" },
  { to: "/gressklipper", label: "Gressklipper" },
  { to: "/stovsugeren", label: "Støvsugeren" },
  { to: "/stromkroniken", label: "Strømkrøniken" },
  { to: "/kvitteringer", label: "Kvitteringer" },
  
  { to: "/skatte-utregningen", label: "Skatte utregningen" },
  { to: "/trening", label: "Trening" },
  { to: "/varsler", label: "Farevarsler" },
  
  { to: "/roborock", label: "Roborock" },
  { to: "/planter", label: "Planter & Trær" },
  { to: "/fly", label: "Fly i nærheten" },
  { to: "/steintavle", label: "Steintavle" },
  { to: "/steintavle-2", label: "Steintavle 2" },
  { to: "/iphone-app", label: "iPhone App" },
  { to: "/varfavoritter", label: "Værfavoritter" },
  { to: "/nsm-sikkerhet", label: "NSM sikkerhet" },
  { to: "/ssb-statistikk", label: "SSB statistikk" },
];

const DEFAULT_LINK_STATE: MenuLinkState = { enabled: true, users: [] };

export const DEFAULT_MENU_VISIBILITY: MenuVisibility = Object.fromEntries(
  MENU_LINK_DEFS.map((l) => [l.to, { ...DEFAULT_LINK_STATE }]),
);

let cache: MenuVisibility | null = null;
let inflight: Promise<MenuVisibility> | null = null;
const listeners = new Set<(v: MenuVisibility) => void>();

function coerceLinkState(value: unknown): MenuLinkState {
  // Bakoverkompatibel: gamle innstillinger lagret bare en boolean per lenke.
  if (typeof value === "boolean") return { enabled: value, users: [] };
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    const enabled = v.enabled === false ? false : true;
    const users = Array.isArray(v.users)
      ? (v.users as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    return { enabled, users };
  }
  return { ...DEFAULT_LINK_STATE };
}

function merge(value: unknown): MenuVisibility {
  const v = (value ?? {}) as Record<string, unknown>;
  const out: MenuVisibility = {};
  for (const def of MENU_LINK_DEFS) {
    out[def.to] = def.to in v ? coerceLinkState(v[def.to]) : { ...DEFAULT_LINK_STATE };
  }
  return out;
}

async function load(): Promise<MenuVisibility> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data } = await supabase
        .from("notification_settings")
        .select("value")
        .eq("key", MENU_VISIBILITY_KEY)
        .maybeSingle();
      const merged = merge(data?.value);
      cache = merged;
      return merged;
    } catch {
      cache = DEFAULT_MENU_VISIBILITY;
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useMenuVisibility(): MenuVisibility {
  const [s, setS] = useState<MenuVisibility>(() => cache ?? DEFAULT_MENU_VISIBILITY);
  useEffect(() => {
    let cancelled = false;
    if (!cache) load().then((v) => { if (!cancelled) setS(v); });
    const cb = (v: MenuVisibility) => setS(v);
    listeners.add(cb);
    return () => { cancelled = true; listeners.delete(cb); };
  }, []);
  return s;
}

export function getMenuLinkState(s: MenuVisibility, to: string): MenuLinkState {
  return s[to] ?? { ...DEFAULT_LINK_STATE };
}

/**
 * Synlig for brukeren `who`? Hjem alltid synlig.
 * Hvis `enabled = false` → skjult.
 * Hvis `users` er tom → synlig for alle.
 * Ellers: kun synlig hvis `who` er i `users`-listen.
 */
export function isMenuLinkVisible(s: MenuVisibility, to: string, who?: string | null): boolean {
  if (to === "/") return true;
  const st = getMenuLinkState(s, to);
  if (!st.enabled) return false;
  if (!st.users || st.users.length === 0) return true;
  if (!who || who === "anon") return true; // pre-auth: behandle global toggle, brukerfilter ignoreres
  return st.users.includes(who);
}

export async function saveMenuVisibility(next: MenuVisibility): Promise<void> {
  cache = next;
  for (const cb of listeners) cb(next);
  const { data: existing } = await supabase
    .from("notification_settings")
    .select("id")
    .eq("key", MENU_VISIBILITY_KEY)
    .maybeSingle();
  if (existing?.id) {
    await supabase
      .from("notification_settings")
      .update({ value: next as never, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabase.from("notification_settings").insert({ key: MENU_VISIBILITY_KEY, value: next as never });
  }
}
