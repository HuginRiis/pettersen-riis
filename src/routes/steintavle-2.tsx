import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/PageShell";
import {
  getNetatmoWeatherStation,
  type WeatherModule,
} from "@/server/netatmo-weather";
import { useLastGood } from "@/hooks/use-last-good";

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
      <header className="container mx-auto px-6 pt-3 pb-2 text-center">
        <div className="text-display tracking-[0.5em] text-primary text-xs sm:text-sm uppercase">
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
      </header>

      {err && (
        <div className="container mx-auto px-4 mb-2">
          <div className="panel rounded-lg p-3 text-center text-xs text-destructive">
            {err}
          </div>
        </div>
      )}

      <main className="container mx-auto px-3 sm:px-6 pb-4">
        <section className="grid gap-3 sm:gap-4 grid-cols-2 mb-3 sm:mb-4">
          <BigCard
            label="Stua"
            value={`${fmt(tempStua, 1)}°`}
            sub={humStua !== null ? `${Math.round(humStua)}% fukt` : undefined}
            accent="primary"
          />
          <BigCard
            label="Ute · Borgen"
            value={`${fmt(tempUte, 1)}°`}
            sub={humUte !== null ? `${Math.round(humUte)}% fukt` : undefined}
            accent="ice"
          />
        </section>

        <section className="grid gap-3 sm:gap-4 grid-cols-2">
          <BigCard
            label="Regn"
            value={`${fmt(rainHour, 1)} mm`}
            sub={
              rainDay !== null
                ? `siste døgn ${fmt(rainDay, 1)} mm`
                : "siste time"
            }
            accent="rain"
          />
          <BigCard
            label="Vind"
            value={`${fmt(wind, 0)} km/t`}
            sub={
              gust !== null
                ? `${compass(windAng)} · kast ${fmt(gust, 0)} ${compass(gustAng)}`
                : compass(windAng)
            }
            accent="wind"
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
}: {
  label: string;
  value: string;
  sub?: string;
  accent: "primary" | "ice" | "rain" | "wind";
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
    <article className="panel rounded-lg p-4 sm:p-6 flex flex-col items-center justify-center text-center min-h-[42vh]">
      <div className="text-display tracking-[0.4em] uppercase text-base sm:text-xl text-primary/80 mb-3 sm:mb-4">
        {label}
      </div>
      <div
        className={`text-display leading-none tabular-nums ${accentCls}`}
        style={{ fontSize: "clamp(5rem, 14vw, 13rem)" }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-3 sm:mt-4 text-muted-foreground tracking-[0.2em] uppercase text-sm sm:text-lg">
          {sub}
        </div>
      )}
    </article>
  );
}
