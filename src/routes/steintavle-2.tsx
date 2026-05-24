import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Settings2, X } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import {
  getNetatmoWeatherStation,
  type WeatherModule,
} from "@/server/netatmo-weather";
import { useLastGood } from "@/hooks/use-last-good";

const SIZE_STORAGE_KEY = "st2.textSizes.v1";
const BOLD_STORAGE_KEY = "st2.textBold.v1";
type TextSizes = { label: number; value: number; sub: number };
type TextBold = { label: boolean; value: boolean; sub: boolean };
const DEFAULT_SIZES: TextSizes = { label: 1, value: 1, sub: 1 };
const DEFAULT_BOLD: TextBold = { label: false, value: false, sub: false };

function loadSizes(): TextSizes {
  if (typeof window === "undefined") return DEFAULT_SIZES;
  try {
    const raw = window.localStorage.getItem(SIZE_STORAGE_KEY);
    if (!raw) return DEFAULT_SIZES;
    const parsed = JSON.parse(raw);
    return {
      label: clamp(Number(parsed.label) || 1, 0.6, 4),
      value: clamp(Number(parsed.value) || 1, 0.6, 4),
      sub: clamp(Number(parsed.sub) || 1, 0.6, 4),
    };
  } catch {
    return DEFAULT_SIZES;
  }
}

function loadBold(): TextBold {
  if (typeof window === "undefined") return DEFAULT_BOLD;
  try {
    const raw = window.localStorage.getItem(BOLD_STORAGE_KEY);
    if (!raw) return DEFAULT_BOLD;
    const parsed = JSON.parse(raw);
    return {
      label: !!parsed.label,
      value: !!parsed.value,
      sub: !!parsed.sub,
    };
  } catch {
    return DEFAULT_BOLD;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export const Route = createFileRoute("/steintavle-2")({
  head: () => ({
    meta: [
      { title: "Steintavle 2 | House Pettersen-Riis" },
      {
        name: "description",
        content:
          "Steintavle 2 — stor visning av temperatur, regn og vind fra borgen på Tollnes.",
      },
      { property: "og:title", content: "Steintavle 2 — House Pettersen-Riis" },
      {
        property: "og:description",
        content:
          "Temperatur inne og ute, regn og vind fra Netatmo-værstasjonen på borgen.",
      },
    ],
  }),
  staleTime: 10 * 60_000,
  preloadStaleTime: 10 * 60_000,
  loader: async () => {
    const netatmo = await getNetatmoWeatherStation({
      data: { stationMatch: "tollnes" },
    }).catch((e) => ({ ok: false as const, error: e?.message ?? "Netatmo-feil" }));
    return { netatmo };
  },
  component: Steintavle2Page,
  errorComponent: ({ error }) => (
    <PageShell minimalHeader>
      <section className="container mx-auto px-4 py-16">
        <div className="panel rounded-lg p-8 text-center">
          <h1 className="heading-hero text-3xl mb-4">Steintavle 2 er stum</h1>
          <p className="text-muted-foreground">{error.message}</p>
        </div>
      </section>
    </PageShell>
  ),
});

function compass(angle?: number): string {
  if (angle === undefined || angle === null) return "—";
  const dirs = ["N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV"];
  return dirs[Math.round((angle % 360) / 45) % 8];
}

function fmt(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}

function Steintavle2Page() {
  const { netatmo } = Route.useLoaderData() as {
    netatmo: Awaited<ReturnType<typeof getNetatmoWeatherStation>>;
  };
  const fetchNetatmo = useServerFn(getNetatmoWeatherStation);
  const router = useRouter();
  const [live, setLive] = useState(netatmo);
  const [now, setNow] = useState<Date | null>(null);
  // Tekststørrelse lagres globalt i localStorage, men panelet starter alltid kollapset.
  const [sizes, setSizes] = useState<TextSizes>(DEFAULT_SIZES);
  const [bold, setBold] = useState<TextBold>(DEFAULT_BOLD);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    setSizes(loadSizes());
    setBold(loadBold());
  }, []);
  const updateSize = (key: keyof TextSizes, val: number) => {
    setSizes((prev) => {
      const next = { ...prev, [key]: val };
      try {
        window.localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  const updateBold = (key: keyof TextBold, val: boolean) => {
    setBold((prev) => {
      const next = { ...prev, [key]: val };
      try {
        window.localStorage.setItem(BOLD_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  const resetSizes = () => {
    setSizes(DEFAULT_SIZES);
    setBold(DEFAULT_BOLD);
    try {
      window.localStorage.removeItem(SIZE_STORAGE_KEY);
      window.localStorage.removeItem(BOLD_STORAGE_KEY);
    } catch {}
  };

  useEffect(() => {
    setNow(new Date());
    const REFRESH_MS = 15 * 60_000;
    const tick = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetchNetatmo({ data: { stationMatch: "tollnes" } });
        setLive(res);
      } catch {
        /* ignore */
      }
      router.invalidate();
      setNow(new Date());
    };
    const id = setInterval(tick, REFRESH_MS);
    const clock = setInterval(() => setNow(new Date()), 30_000);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchNetatmo, router]);

  const ns = live.ok ? live : null;
  const modules: WeatherModule[] = ns?.modules ?? [];
  const mainModule = modules.find((m) => m.type === "NAMain") ?? null;
  const outdoorModule = modules.find((m) => m.type === "NAModule1") ?? null;
  const windModule = modules.find((m) => m.type === "NAModule2") ?? null;
  const rainModule = modules.find((m) => m.type === "NAModule3") ?? null;
  const indoorModules = modules.filter((m) => m.type === "NAModule4");
  const noraModule =
    indoorModules.find((m) => /nora/i.test(m.name)) ?? null;
  const bedroomModule =
    indoorModules.find(
      (m) => /sov|sove|bed/i.test(m.name) && !/nora/i.test(m.name),
    ) ??
    indoorModules.find((m) => !noraModule || m.id !== noraModule.id) ??
    null;

  const tempStuaLive = mainModule?.metrics.temperature ?? null;
  const tempUteLive = outdoorModule?.metrics.temperature ?? null;
  const tempSovLive = bedroomModule?.metrics.temperature ?? null;
  const tempNoraLive = noraModule?.metrics.temperature ?? null;

  const stuaLG = useLastGood("st2.lg.stua", tempStuaLive);
  const uteLG = useLastGood("st2.lg.ute", tempUteLive);
  const sovLG = useLastGood("st2.lg.sov", tempSovLive);
  const noraLG = useLastGood("st2.lg.nora", tempNoraLive);
  const tempStua = stuaLG.value;
  const tempUte = uteLG.value;
  const tempSov = sovLG.value;
  const tempNora = noraLG.value;

  const humUte = outdoorModule?.metrics.humidity ?? null;
  const humStua = mainModule?.metrics.humidity ?? null;
  const humSov = bedroomModule?.metrics.humidity ?? null;
  const humNora = noraModule?.metrics.humidity ?? null;

  const rainHour = rainModule?.metrics.rain ?? null;
  const rainDay = rainModule?.metrics.rainDay ?? null;

  // Netatmo gir vind i km/t — vi viser m/s (km/t / 3.6)
  const windKmh = windModule?.metrics.windStrength ?? null;
  const gustKmh = windModule?.metrics.gustStrength ?? null;
  const wind = windKmh !== null ? windKmh / 3.6 : null;
  const gust = gustKmh !== null ? gustKmh / 3.6 : null;
  const windAng = windModule?.metrics.windAngle;
  const gustAng = windModule?.metrics.gustAngle;

  const err = !live.ok ? live.error : null;

  return (
    <PageShell minimalHeader>
      <header className="container mx-auto px-6 pt-3 pb-2 flex items-center justify-between gap-3">
        <div className="w-8" aria-hidden />
        <div className="text-display tracking-[0.5em] text-primary text-xs sm:text-sm uppercase text-center flex-1">
          Steintavle 2 · Borgen ·{" "}
          <span className="text-muted-foreground">
            {now
              ? now.toLocaleTimeString("nb-NO", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen((o) => !o)}
          className="w-8 h-8 rounded-md border border-border bg-background/60 text-muted-foreground hover:text-primary flex items-center justify-center"
          aria-label="Tekststørrelse"
          aria-expanded={settingsOpen}
        >
          {settingsOpen ? <X size={16} /> : <Settings2 size={16} />}
        </button>
      </header>

      {settingsOpen && (
        <div className="container mx-auto px-4 mb-2">
          <div className="panel rounded-lg p-3 sm:p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-display tracking-[0.3em] uppercase text-[10px] text-primary/80">
                Tekststørrelse
              </span>
              <button
                type="button"
                onClick={resetSizes}
                className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground hover:text-primary"
              >
                Nullstill
              </button>
            </div>
            <SizeSlider
              label="Navn"
              value={sizes.label}
              onChange={(v) => updateSize("label", v)}
              bold={bold.label}
              onBoldChange={(b) => updateBold("label", b)}
            />
            <SizeSlider
              label="Verdi"
              value={sizes.value}
              onChange={(v) => updateSize("value", v)}
              bold={bold.value}
              onBoldChange={(b) => updateBold("value", b)}
            />
            <SizeSlider
              label="Småtekst"
              value={sizes.sub}
              onChange={(v) => updateSize("sub", v)}
              bold={bold.sub}
              onBoldChange={(b) => updateBold("sub", b)}
            />
          </div>
        </div>
      )}


      {err && (
        <div className="container mx-auto px-4 mb-2">
          <div className="panel rounded-lg p-3 text-center text-xs text-destructive">
            {err}
          </div>
        </div>
      )}

      <main className="container mx-auto px-3 sm:px-6 pb-4">
        <section className="grid gap-2 sm:gap-3 grid-cols-2">
          <BigCard
            label="Stua"
            value={`${fmt(tempStua, 1)}°`}
            sub={humStua !== null ? `${Math.round(humStua)}% fukt` : undefined}
            accent="primary" sizes={sizes}
          />
          <BigCard
            label="Ute · Borgen"
            value={`${fmt(tempUte, 1)}°`}
            sub={humUte !== null ? `${Math.round(humUte)}% fukt` : undefined}
            accent="ice" sizes={sizes}
          />
          <BigCard
            label="Soverom"
            value={`${fmt(tempSov, 1)}°`}
            sub={humSov !== null ? `${Math.round(humSov)}% fukt` : undefined}
            accent="primary" sizes={sizes}
          />
          <BigCard
            label="Nora sitt rom"
            value={`${fmt(tempNora, 1)}°`}
            sub={humNora !== null ? `${Math.round(humNora)}% fukt` : undefined}
            accent="primary" sizes={sizes}
          />
          <BigCard
            label="Regn"
            value={`${fmt(rainHour, 1)} mm`}
            sub={
              rainDay !== null
                ? `siste døgn ${fmt(rainDay, 1)} mm`
                : "siste time"
            }
            accent="rain" sizes={sizes}
          />
          <BigCard
            label="Vind"
            value={`${fmt(wind, 1)} m/s`}
            sub={
              gust !== null
                ? `${compass(windAng)} · kast ${fmt(gust, 1)} m/s ${compass(gustAng)}`
                : compass(windAng)
            }
            accent="wind" sizes={sizes}
          />
        </section>

        <div className="text-center mt-3 text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
          Netatmo · oppdaterer hvert 15. min
        </div>
      </main>
    </PageShell>
  );
}

function BigCard({
  label,
  value,
  sub,
  accent,
  sizes,
  bold,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: "primary" | "ice" | "rain" | "wind";
  sizes: TextSizes;
  bold: TextBold;
}) {
  const accentCls =
    accent === "ice"
      ? "text-sky-400"
      : accent === "rain"
        ? "text-blue-400"
        : accent === "wind"
          ? "text-emerald-400"
          : "text-primary";
  return (
    <article className="panel rounded-lg p-3 sm:p-4 flex flex-col items-center justify-center text-center min-h-[28vh]">
      <div
        className="text-display tracking-[0.4em] uppercase text-primary/80 mb-2 sm:mb-3"
        style={{
          fontSize: `clamp(0.75rem, ${2.2 * sizes.label}vw, ${1.4 * sizes.label}rem)`,
          fontWeight: bold.label ? 700 : undefined,
        }}
      >
        {label}
      </div>
      <div
        className={`text-display leading-none tabular-nums ${accentCls}`}
        style={{
          fontSize: `clamp(${3.5 * sizes.value}rem, ${11 * sizes.value}vw, ${9 * sizes.value}rem)`,
          fontWeight: bold.value ? 700 : undefined,
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="mt-3 sm:mt-4 text-muted-foreground tracking-[0.2em] uppercase"
          style={{
            fontSize: `clamp(0.75rem, ${2 * sizes.sub}vw, ${1.25 * sizes.sub}rem)`,
            fontWeight: bold.sub ? 700 : undefined,
          }}
        >
          {sub}
        </div>
      )}
    </article>
  );
}

function SizeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-20 text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
        {label}
      </span>
      <input
        type="range"
        min={0.6}
        max={4}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-primary"
      />
      <span className="w-12 text-right tabular-nums text-[11px] text-foreground">
        {Math.round(value * 100)}%
      </span>
    </label>
  );
}

