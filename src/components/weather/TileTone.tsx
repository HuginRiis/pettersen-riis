import { createContext, useCallback, useContext } from "react";
import { usePerUserPersistedState } from "@/hooks/use-per-user-persisted-state";

export type TileTone = 0 | 1 | 2 | 3;

const TONE_LABELS: Record<TileTone, string> = {
  0: "Lys grå",
  1: "Grå",
  2: "Medium grå",
  3: "Meget grå",
};


const TONE_ICONS: Record<TileTone, string> = {
  0: "☀️",
  1: "⛅",
  2: "☁️",
  3: "🌑",
};

const TileToneContext = createContext<{
  tone: TileTone;
  cycleTone: () => void;
}>({ tone: 3, cycleTone: () => {} });

export function TileToneProvider({ children }: { children: React.ReactNode }) {
  const [tone, setTone] = usePerUserPersistedState<TileTone>("var.tileTone", 3);
  const cycleTone = useCallback(() => {
    setTone(((tone + 1) % 4) as TileTone);
  }, [tone, setTone]);
  return (
    <TileToneContext.Provider value={{ tone, cycleTone }}>
      {children}
    </TileToneContext.Provider>
  );
}

export function useTileTone() {
  return useContext(TileToneContext);
}

export function tileToneClasses(tone: TileTone): string {
  switch (tone) {
    case 0:
      return "tile-tone-0 bg-slate-300/90 border-slate-500/20 text-slate-900";
    case 1:
      return "tile-tone-1 bg-slate-400/85 border-slate-600/20 text-slate-900";
    case 2:
      return "tile-tone-2 bg-slate-600/80 border-white/20 text-white";
    case 3:
    default:
      return "tile-tone-3 bg-slate-800/90 border-white/15 text-white";
  }
}


export function TileToneToggle() {
  const { tone, cycleTone } = useTileTone();
  const label = TONE_LABELS[tone];
  const icon = TONE_ICONS[tone];
  return (
    <button
      type="button"
      onClick={cycleTone}
      aria-label={`Flis tone: ${label}. Klikk for å bytte.`}
      title={`Flis tone: ${label}`}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium backdrop-blur-xl border transition-all bg-white/10 text-white/80 border-white/15 hover:bg-white/20"
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
