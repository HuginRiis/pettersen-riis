import { createContext, useCallback, useContext } from "react";
import { usePerUserPersistedState } from "@/hooks/use-per-user-persisted-state";

export const TILE_OPACITY_STEPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;
export type TileOpacity = (typeof TILE_OPACITY_STEPS)[number];

const TileOpacityContext = createContext<{
  opacity: TileOpacity;
  cycleOpacity: () => void;
}>({ opacity: 100, cycleOpacity: () => {} });

export function TileOpacityProvider({ children }: { children: React.ReactNode }) {
  const [opacity, setOpacity] = usePerUserPersistedState<TileOpacity>("var.tileOpacity", 100);
  const cycleOpacity = useCallback(() => {
    const idx = TILE_OPACITY_STEPS.indexOf(opacity);
    const next = (idx + 1) % TILE_OPACITY_STEPS.length;
    setOpacity(TILE_OPACITY_STEPS[next]);
  }, [opacity, setOpacity]);
  return (
    <TileOpacityContext.Provider value={{ opacity, cycleOpacity }}>
      {children}
    </TileOpacityContext.Provider>
  );
}

export function useTileOpacity() {
  return useContext(TileOpacityContext);
}

export function TileOpacityToggle() {
  const { opacity, cycleOpacity } = useTileOpacity();
  return (
    <button
      type="button"
      onClick={cycleOpacity}
      aria-label={`Flis gjennomsiktighet: ${opacity}%. Klikk for å bytte.`}
      title={`Flis gjennomsiktighet: ${opacity}%`}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium backdrop-blur-xl border transition-all bg-white/10 text-white/80 border-white/15 hover:bg-white/20"
    >
      <span>◐</span>
      <span>{opacity}%</span>
    </button>
  );
}
