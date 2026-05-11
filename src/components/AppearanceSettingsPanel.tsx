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
import {
  useSceneMarquee,
  SCENE_FONT_MIN,
  SCENE_FONT_MAX,
  SCENE_SPEED_MIN,
  SCENE_SPEED_MAX,
} from "@/hooks/use-scene-marquee";
import { MarqueeText } from "@/components/MarqueeText";

export function AppearanceSettingsPanel() {
  const [fontDelta, setFontDelta] = useFontDeltaPct();
  const [width, setWidth] = useContentWidthPct();
  const [headerInset, setHeaderInset] = useHeaderLeftInsetPct();
  const scene = useSceneMarquee();

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

        {/* Lys-scene marquee */}
        <section className="space-y-3 pt-2 border-t border-border/40">
          <header>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">
              💡 Lys-scener — rullende navn
            </h3>
            <p className="text-[10px] text-muted-foreground mt-1">
              Fast fontstørrelse på scenenavn. Hvis teksten er for lang, ruller
              den i boksen.
            </p>
          </header>

          {/* Forhåndsvisning */}
          <div className="rounded-md border border-border/60 bg-background/40 p-2">
            <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
              Forhåndsvisning
            </div>
            <div className="w-[180px] panel rounded p-2">
              <MarqueeText
                text="Tenn alle stuelys og taklys i hele huset"
                className="text-display tracking-[0.05em] uppercase text-foreground"
              />
            </div>
          </div>

          {/* Fontstørrelse */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">Fontstørrelse</label>
              <span className="text-xs tabular-nums text-primary">{scene.fontPx}px</span>
            </div>
            <Slider
              value={[scene.fontPx]}
              onValueChange={(v) => scene.setFontPx(v[0] ?? 12)}
              min={SCENE_FONT_MIN}
              max={SCENE_FONT_MAX}
              step={1}
            />
          </div>

          {/* Hastighet */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">Rullehastighet</label>
              <span className="text-xs tabular-nums text-primary">{scene.speedPxPerSec} px/s</span>
            </div>
            <Slider
              value={[scene.speedPxPerSec]}
              onValueChange={(v) => scene.setSpeed(v[0] ?? 40)}
              min={SCENE_SPEED_MIN}
              max={SCENE_SPEED_MAX}
              step={5}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Sakte</span>
              <span>Rask</span>
            </div>
          </div>

          {/* Modus */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">Rullemodus</label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant={scene.mode === "loop" ? "default" : "outline"}
                onClick={() => scene.setMode("loop")}
                className="h-8 text-[11px]"
              >
                Rundt og rundt
              </Button>
              <Button
                size="sm"
                variant={scene.mode === "pingpong" ? "default" : "outline"}
                onClick={() => scene.setMode("pingpong")}
                className="h-8 text-[11px]"
              >
                Frem og tilbake
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
