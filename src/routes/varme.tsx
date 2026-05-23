import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Thermometer, Snowflake, Sun, Flame, Bell, ChevronRight, Sparkles } from "lucide-react";
import { PageShell, PageHero } from "@/components/PageShell";
import { HeatersPanel } from "@/components/HeatersPanel";
import { ClimateNotificationSettings } from "@/components/ClimateNotificationSettings";
import { getNetatmoWeatherStation, type WeatherStationResult } from "@/server/netatmo-weather";
import heroImg from "@/assets/got-varme.jpg";

export const Route = createFileRoute("/varme")({
  head: () => ({
    meta: [
      { title: "Varme & Klima | House Pettersen-Riis" },
      {
        name: "description",
        content:
          "Styring av varme, kjøling og luftretning for borgen og hytta — med smarte anbefalinger.",
      },
      { property: "og:title", content: "Varme & Klima — Borgens Ildsteder" },
      {
        property: "og:description",
        content: "All varme- og klimastyring fra Homey på ett sted.",
      },
    ],
  }),
  component: VarmePage,
});

type OkData = Extract<WeatherStationResult, { ok: true }>;

function useNetatmoTemps(stationMatch = "tollnes") {
  const fetchData = useServerFn(getNetatmoWeatherStation);
  const [data, setData] = useState<OkData | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let id: ReturnType<typeof setInterval>;
    const load = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await fetchData({ data: { stationMatch } });
        if (res.ok) setData(res);
      } catch {
        /* ignore */
      } finally {
        inFlight.current = false;
      }
    };
    load();
    id = setInterval(load, 5 * 60_000);
    return () => clearInterval(id);
  }, [fetchData, stationMatch]);

  const indoor = data?.modules.find((m) => m.type === "NAMain");
  const outdoor = data?.modules.find((m) => m.type === "NAModule1");
  return {
    indoor: indoor?.metrics.temperature ?? null,
    outdoor: outdoor?.metrics.temperature ?? null,
  };
}

function HeroTempBadges() {
  const { indoor, outdoor } = useNetatmoTemps();
  const Item = ({
    label,
    value,
    icon: Icon,
  }: {
    label: string;
    value: number | null;
    icon: typeof Sun;
  }) => (
    <div
      className="flex items-center gap-2 sm:gap-3 px-3 py-2 rounded-full backdrop-blur-md"
      style={{
        background: "color-mix(in oklab, var(--background) 35%, transparent)",
        border: "1px solid color-mix(in oklab, var(--gold) 40%, transparent)",
      }}
    >
      <Icon size={16} className="text-[var(--gold)]" />
      <span className="text-[9px] sm:text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
        {label}
      </span>
      <span className="text-display tabular-nums text-base sm:text-xl text-[var(--gold)]">
        {value === null ? "–" : `${value.toFixed(1)}°`}
      </span>
    </div>
  );
  return (
    <div className="flex flex-wrap gap-2 sm:gap-3">
      <Item label="Stua" value={indoor} icon={Flame} />
      <Item label="Ute" value={outdoor} icon={Snowflake} />
    </div>
  );
}

const TOC = [
  { id: "anbefalinger", label: "Smarte anbefalinger", icon: Sparkles },
  { id: "borg", label: "Borgen", icon: Flame },
  { id: "hytta", label: "Hytta", icon: Snowflake },
  { id: "varslinger", label: "Varslinger", icon: Bell },
] as const;

function TableOfContents() {
  return (
    <section className="container mx-auto px-4 pt-8">
      <div className="panel rounded-lg p-4">
        <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-3">
          Innholdsfortegnelse
        </div>
        <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TOC.map((t) => (
            <li key={t.id}>
              <a
                href={`#${t.id}`}
                className="flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors hover:text-[var(--gold)]"
                style={{
                  background: "color-mix(in oklab, var(--foreground) 5%, transparent)",
                  border: "1px solid color-mix(in oklab, var(--gold) 18%, transparent)",
                }}
              >
                <t.icon size={14} className="text-[var(--gold)]" />
                <span className="flex-1 truncate">{t.label}</span>
                <ChevronRight size={12} className="text-muted-foreground" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SmartAdvice() {
  const { indoor, outdoor } = useNetatmoTemps();
  const tips: { text: string; tone: "warm" | "cold" | "ok" | "info" }[] = [];
  if (indoor !== null && outdoor !== null) {
    const diff = indoor - outdoor;
    if (indoor > 24) tips.push({ text: `Stua er ${indoor.toFixed(1)}° — vurder å skru ned varmen et hakk.`, tone: "warm" });
    if (indoor < 19) tips.push({ text: `Stua er ${indoor.toFixed(1)}° — kanskje fyre opp varmepumpa?`, tone: "cold" });
    if (outdoor > 20 && indoor < outdoor) tips.push({ text: "Det er varmere ute enn inne — luft kort for å hente inn varmen.", tone: "info" });
    if (outdoor < 5 && diff < 15) tips.push({ text: "Kaldt ute. Sjekk at alle ovner står i sparemodus om natten.", tone: "info" });
    if (outdoor > 25 && indoor > 25) tips.push({ text: "Hetebølge — start klimaanlegget i stua i kjøle-modus.", tone: "warm" });
    if (!tips.length) tips.push({ text: `Temperaturen ser god ut. Inne ${indoor.toFixed(1)}°, ute ${outdoor.toFixed(1)}°.`, tone: "ok" });
  } else {
    tips.push({ text: "Henter måleverdier fra Netatmo …", tone: "info" });
  }
  const toneStyle = (tone: string) => {
    if (tone === "warm") return { color: "#fb923c", border: "color-mix(in oklab, #fb923c 35%, transparent)" };
    if (tone === "cold") return { color: "#7dd3fc", border: "color-mix(in oklab, #7dd3fc 35%, transparent)" };
    if (tone === "ok") return { color: "#86efac", border: "color-mix(in oklab, #86efac 35%, transparent)" };
    return { color: "var(--muted-foreground)", border: "color-mix(in oklab, var(--gold) 22%, transparent)" };
  };
  return (
    <section id="anbefalinger" className="container mx-auto px-4 py-8 scroll-mt-20">
      <div className="ornate-divider mb-6">
        <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
          Smarte anbefalinger
        </span>
      </div>
      <ul className="space-y-2">
        {tips.map((t, i) => {
          const s = toneStyle(t.tone);
          return (
            <li
              key={i}
              className="panel rounded-lg p-3 flex items-start gap-3"
              style={{ border: `1px solid ${s.border}` }}
            >
              <Sparkles size={14} style={{ color: s.color }} className="shrink-0 mt-0.5" />
              <span className="text-sm" style={{ color: s.color }}>{t.text}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function VarmePage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Varme & Klima"
        title="Borgens Ildsteder"
        subtitle="All varme- og klimastyring fra Homey — borgen og hytta."
        image={heroImg}
      >
        <HeroTempBadges />
      </PageHero>

      <TableOfContents />
      <SmartAdvice />

      <div id="borg" className="scroll-mt-20" />
      <HeatersPanel
        location="borg"
        title="Borgen — varme & klima"
        emptyHint="Ingen varme- eller klimaenheter i borgen ennå."
      />

      <div id="hytta" className="scroll-mt-20" />
      <HeatersPanel
        location="hytta"
        title="Hytta — varme & klima"
        emptyHint="Ingen varme- eller klimaenheter på hytta ennå."
      />

      <section id="varslinger" className="container mx-auto px-4 py-12 scroll-mt-20">
        <div className="ornate-divider mb-6 flex items-center gap-2">
          <Bell size={14} className="text-[var(--gold)]" />
          <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
            Varslinger om temperatur
          </span>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Velg når ravnen skal varsle deg om at det blir for varmt eller for kaldt
          i stua og soverommet (10°–30°).
        </p>
        <ClimateNotificationSettings />
      </section>
    </PageShell>
  );
}
