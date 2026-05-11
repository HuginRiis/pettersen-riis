import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  useFontDeltaPct,
  useContentWidthPct,
  useHeaderLeftInsetPct,
  FONT_MIN,
  FONT_MAX,
  WIDTH_MIN,
  WIDTH_MAX,
  HEADER_INSET_MIN,
  HEADER_INSET_MAX,
} from "@/hooks/use-appearance";

export function AppearanceSettingsPanel() {
  const [fontDelta, setFontDelta] = useFontDeltaPct();
  const [width, setWidth] = useContentWidthPct();
  const [headerInset, setHeaderInset] = useHeaderLeftInsetPct();

  return (
    <div className="container mx-auto px-4 pt-4">
      <div className="panel rounded-lg p-4 space-y-6">
        <header>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-primary mb-1 flex items-center gap-2">
            🅰️ Utseende — skrift og bredde
          </h2>
          <p className="text-xs text-muted-foreground">
            Juster skriftstørrelse, innholdsbredde og topp-meny. Steintavle-siden er
            uberørt av skriftstørrelse.
          </p>
        </header>

        {/* Font size */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground">
              Skriftstørrelse
            </label>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs tabular-nums ${
                  fontDelta === 0
                    ? "text-muted-foreground"
                    : fontDelta > 0
                      ? "text-primary"
                      : "text-blood"
                }`}
              >
                {fontDelta > 0 ? "+" : ""}
                {fontDelta}%
              </span>
              {fontDelta !== 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setFontDelta(0)}
                >
                  Nullstill
                </Button>
              )}
            </div>
          </div>
          <Slider
            value={[fontDelta]}
            onValueChange={(v) => setFontDelta(v[0] ?? 0)}
            min={FONT_MIN}
            max={FONT_MAX}
            step={1}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>−20%</span>
            <span>0</span>
            <span>+20%</span>
          </div>
        </section>

        {/* Content width */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground">
              Innholdsbredde
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs tabular-nums text-primary">{width}%</span>
              {width !== 100 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setWidth(100)}
                >
                  Nullstill
                </Button>
              )}
            </div>
          </div>
          <Slider
            value={[width]}
            onValueChange={(v) => setWidth(v[0] ?? 100)}
            min={WIDTH_MIN}
            max={WIDTH_MAX}
            step={1}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>50% (smalt)</span>
            <span>100% (standard)</span>
            <span>150% (stort)</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            100% = standard. Endrer kun bredden på innholds-boksene (gir mer
            eller mindre plass innvendig). Påvirker ikke høyde eller skrift.
          </p>
        </section>

        {/* Header left inset (mobil-popup-meny) */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground">
              Mobil-meny (hamburger) — skrumping fra venstre
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs tabular-nums text-primary">{headerInset}%</span>
              {headerInset !== 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setHeaderInset(0)}
                >
                  Nullstill
                </Button>
              )}
            </div>
          </div>
          <Slider
            value={[headerInset]}
            onValueChange={(v) => setHeaderInset(v[0] ?? 0)}
            min={HEADER_INSET_MIN}
            max={HEADER_INSET_MAX}
            step={1}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0% (full bredde)</span>
            <span>50% (smal)</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Skyver popup-menyen som åpnes med hamburger-knappen innover fra
            venstre. Høyre kant står fast.
          </p>
        </section>
      </div>
    </div>
  );
}
