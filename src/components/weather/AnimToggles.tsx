import { createContext, useContext } from "react";
import { usePerUserPersistedState } from "@/hooks/use-per-user-persisted-state";

export type AnimFlags = {
  bg: boolean;
  rotating: boolean;
  daily: boolean;
  tiles: boolean;
};

const DEFAULT: AnimFlags = { bg: true, rotating: true, daily: true, tiles: true };

const Ctx = createContext<{
  flags: AnimFlags;
  toggle: (k: keyof AnimFlags) => void;
}>({ flags: DEFAULT, toggle: () => {} });

export function AnimTogglesProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = usePerUserPersistedState<AnimFlags>("var.animFlags", DEFAULT);
  const toggle = (k: keyof AnimFlags) => setFlags({ ...DEFAULT, ...flags, [k]: !(flags?.[k] ?? true) });
  const merged = { ...DEFAULT, ...flags };
  return <Ctx.Provider value={{ flags: merged, toggle }}>{children}</Ctx.Provider>;
}

export function useAnimToggles() {
  return useContext(Ctx);
}

const LABELS: Record<keyof AnimFlags, { on: string; off: string; icon: string }> = {
  bg:       { on: "Bakgrunn på",     off: "Bakgrunn av",     icon: "🌤️" },
  rotating: { on: "Rullerende på",   off: "Rullerende av",   icon: "🔄" },
  daily:    { on: "10 dager på",     off: "10 dager av",     icon: "📅" },
  tiles:    { on: "Fliser på",       off: "Fliser av",       icon: "🧊" },
};

export function AnimTogglesPanel() {
  const { flags, toggle } = useAnimToggles();
  const keys: (keyof AnimFlags)[] = ["bg", "rotating", "daily", "tiles"];
  return (
    <div className="flex flex-col gap-1.5 px-1">
      <span className="text-[10px] text-white/50 uppercase tracking-wider">Animasjoner</span>
      <div className="flex flex-wrap gap-1.5">
        {keys.map((k) => {
          const on = flags[k];
          const l = LABELS[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggle(k)}
              aria-pressed={on}
              title={on ? l.on : l.off}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium transition-all border ${
                on
                  ? "bg-white text-slate-900 border-white"
                  : "bg-white/10 text-white/70 border-white/15 hover:bg-white/20"
              }`}
            >
              <span>{l.icon}</span>
              <span>{on ? l.on : l.off}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
