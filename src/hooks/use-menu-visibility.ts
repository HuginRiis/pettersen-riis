import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MenuVisibility = Record<string, boolean>;

export const MENU_VISIBILITY_KEY = "menu_visibility";

// Alle ruter som kan vises i topp-menyen. Holdes synkron med navLinks i SiteHeader.
export const MENU_LINK_DEFS: { to: string; label: string }[] = [
  { to: "/", label: "Hjem" },
  { to: "/var", label: "Vær" },
  { to: "/pollen", label: "Pollen" },
  { to: "/turer", label: "Ferden" },
  { to: "/got-saga", label: "Westeros" },
  { to: "/agenda", label: "Søppel, bursdager og meldinger" },
  { to: "/push-varslinger", label: "Innstillinger" },
  { to: "/vakttarnet", label: "Vakttårnet" },
  { to: "/hytta", label: "Hytta" },
  { to: "/smarthus", label: "Smartborg" },
  { to: "/lys", label: "Lys" },
  { to: "/gressklipper", label: "Gressklipper" },
  { to: "/stovsugeren", label: "Støvsugeren" },
  { to: "/stromkroniken", label: "Strømkrøniken" },
  { to: "/oppussing-borgen", label: "Prosjekter på Borgen" },
  { to: "/oppussing-hytta", label: "Prosjekter på hytta" },
  { to: "/matvarer", label: "Varer" },
  { to: "/kvitteringer", label: "Kvitteringer" },
  { to: "/okonomi", label: "Husholdningens hvelv" },
  { to: "/skatte-utregningen", label: "Skatte utregningen" },
  { to: "/hundene", label: "Hundene" },
  { to: "/trening", label: "Trening" },
  { to: "/varsler", label: "Farevarsler" },
  { to: "/steintavle", label: "Steintavle" },
  { to: "/decibel", label: "Decibelmåler" },
  { to: "/planter", label: "Planter & Trær" },
];

export const DEFAULT_MENU_VISIBILITY: MenuVisibility = Object.fromEntries(
  MENU_LINK_DEFS.map((l) => [l.to, true]),
);

let cache: MenuVisibility | null = null;
let inflight: Promise<MenuVisibility> | null = null;
const listeners = new Set<(v: MenuVisibility) => void>();

function merge(value: unknown): MenuVisibility {
  const v = (value ?? {}) as Record<string, unknown>;
  const out: MenuVisibility = { ...DEFAULT_MENU_VISIBILITY };
  for (const def of MENU_LINK_DEFS) {
    if (def.to in v) out[def.to] = v[def.to] !== false;
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

export function isMenuLinkVisible(s: MenuVisibility, to: string): boolean {
  // Hjem skal aldri kunne skjules — den er låst på.
  if (to === "/") return true;
  const v = s[to];
  return v !== false;
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
