import { createContext, useContext, useState, useRef, useEffect, useMemo } from "react";
import { usePerUserPersistedState } from "@/hooks/use-per-user-persisted-state";

export type TileColor = string | null;
export type TileGlass = "none" | "low" | "medium" | "full";

export const TILE_COLOR_PALETTE: { id: string; label: string; value: string }[] = [
  // Blå nyanser
  { id: "sky-300", label: "Lys himmel", value: "rgba(125, 211, 252, 0.55)" },
  { id: "sky-500", label: "Himmel", value: "rgba(14, 165, 233, 0.55)" },
  { id: "blue-500", label: "Blå", value: "rgba(59, 130, 246, 0.55)" },
  { id: "blue-700", label: "Dyp blå", value: "rgba(29, 78, 216, 0.65)" },
  { id: "indigo-600", label: "Indigo", value: "rgba(79, 70, 229, 0.6)" },
  { id: "slate-blue", label: "Skifer-blå", value: "rgba(51, 65, 85, 0.7)" },
  { id: "navy", label: "Marine", value: "rgba(15, 23, 42, 0.75)" },
  { id: "teal", label: "Petrol", value: "rgba(13, 148, 136, 0.55)" },
  // Grå nyanser
  { id: "gray-200", label: "Lys grå", value: "rgba(229, 231, 235, 0.7)" },
  { id: "gray-400", label: "Grå", value: "rgba(156, 163, 175, 0.65)" },
  { id: "gray-600", label: "Mørk grå", value: "rgba(75, 85, 99, 0.7)" },
  { id: "zinc-800", label: "Kull", value: "rgba(39, 39, 42, 0.75)" },
  // 10 nye farger
  { id: "emerald", label: "Smaragd", value: "rgba(16, 185, 129, 0.55)" },
  { id: "green", label: "Grønn", value: "rgba(34, 197, 94, 0.55)" },
  { id: "lime", label: "Lime", value: "rgba(132, 204, 22, 0.55)" },
  { id: "yellow", label: "Gul", value: "rgba(234, 179, 8, 0.55)" },
  { id: "amber", label: "Rav", value: "rgba(245, 158, 11, 0.6)" },
  { id: "orange", label: "Oransje", value: "rgba(249, 115, 22, 0.6)" },
  { id: "red", label: "Rød", value: "rgba(239, 68, 68, 0.6)" },
  { id: "rose", label: "Rose", value: "rgba(244, 63, 94, 0.6)" },
  { id: "pink", label: "Rosa", value: "rgba(236, 72, 153, 0.55)" },
  { id: "purple", label: "Lilla", value: "rgba(168, 85, 247, 0.6)" },
];

const GLASS_MULT: Record<TileGlass, number> = {
  none: 1,
  low: 0.65,
  medium: 0.35,
  full: 0.12,
};

const GLASS_LABEL: Record<TileGlass, string> = {
  none: "Ingen glass",
  low: "Litt glass",
  medium: "Medium glass",
  full: "Helt glass",
};

const GLASS_ORDER: TileGlass[] = ["none", "low", "medium", "full"];

function applyGlass(color: string | null, glass: TileGlass): string | null {
  if (!color) return null;
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/i);
  if (!m) return color;
  const r = m[1], g = m[2], b = m[3];
  const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
  const newA = Math.max(0, Math.min(1, a * GLASS_MULT[glass]));
  return `rgba(${r}, ${g}, ${b}, ${newA.toFixed(3)})`;
}

const TileColorContext = createContext<{
  color: TileColor;
  setColor: (c: TileColor) => void;
  glass: TileGlass;
  setGlass: (g: TileGlass) => void;
  effectiveColor: TileColor;
}>({ color: null, setColor: () => {}, glass: "none", setGlass: () => {}, effectiveColor: null });

export function TileColorProvider({ children }: { children: React.ReactNode }) {
  const [color, setColor] = usePerUserPersistedState<TileColor>("var.tileColor", null);
  const [glass, setGlass] = usePerUserPersistedState<TileGlass>("var.tileGlass", "none");
  const effectiveColor = useMemo(() => applyGlass(color, glass), [color, glass]);
  return (
    <TileColorContext.Provider value={{ color, setColor, glass, setGlass, effectiveColor }}>
      {children}
    </TileColorContext.Provider>
  );
}

export function useTileColor() {
  const ctx = useContext(TileColorContext);
  // Bakoverkompatibel: `color` returnert er effektiv farge (med glass anvendt).
  return { ...ctx, color: ctx.effectiveColor, rawColor: ctx.color };
}

export function TileColorToggle() {
  const { rawColor, setColor } = useTileColor();
  const color = rawColor;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const active = TILE_COLOR_PALETTE.find((p) => p.value === color);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Velg flisfarge"
        title="Velg flisfarge"
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium backdrop-blur-xl border transition-all bg-white/10 text-white/80 border-white/15 hover:bg-white/20"
      >
        <span
          className="inline-block w-3 h-3 rounded-full border border-white/40"
          style={{ background: color ?? "transparent" }}
        />
        <span>{active ? active.label : "Farge"}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 z-50 p-2 rounded-xl bg-slate-900/95 border border-white/15 backdrop-blur-xl shadow-2xl w-[176px]">
          <div className="grid grid-cols-4 gap-1.5">
            <button
              type="button"
              onClick={() => {
                setColor(null);
                setOpen(false);
              }}
              title="Ingen farge"
              className={`w-9 h-9 rounded-md border flex items-center justify-center text-[10px] text-white/80 ${
                color === null ? "border-white ring-2 ring-white/40" : "border-white/20"
              }`}
              style={{
                background:
                  "repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0 4px, rgba(255,255,255,0.02) 4px 8px)",
              }}
            >
              Av
            </button>
            {TILE_COLOR_PALETTE.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setColor(p.value);
                  setOpen(false);
                }}
                title={p.label}
                aria-label={p.label}
                className={`w-9 h-9 rounded-md border transition-all ${
                  color === p.value ? "border-white ring-2 ring-white/50 scale-105" : "border-white/20 hover:border-white/50"
                }`}
                style={{ background: p.value }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TileGlassToggle() {
  const { glass, setGlass } = useTileColor();
  const cycle = () => {
    const i = GLASS_ORDER.indexOf(glass);
    setGlass(GLASS_ORDER[(i + 1) % GLASS_ORDER.length]);
  };
  // Visuell indikator: antall fylte prikker = glass-nivå
  const level = GLASS_ORDER.indexOf(glass); // 0..3
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Glass-effekt: ${GLASS_LABEL[glass]}. Klikk for å bytte.`}
      title={GLASS_LABEL[glass]}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium backdrop-blur-xl border transition-all bg-white/10 text-white/80 border-white/15 hover:bg-white/20"
    >
      <span className="flex items-center gap-0.5">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              i <= level ? "bg-white/90" : "bg-white/25"
            }`}
          />
        ))}
      </span>
      <span>Glass</span>
    </button>
  );
}
