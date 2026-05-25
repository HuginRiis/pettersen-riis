import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Snowflake,
  Sun,
  Flame,
  Bell,
  ChevronRight,
  Sparkles,
  ArrowUp,
  ArrowDown,
  Minus,
  Mountain,
  Castle,
  Wind,
  Droplets,
  TreePine,
} from "lucide-react";
import { PageShell, PageHero } from "@/components/PageShell";
import { HeatersPanel } from "@/components/HeatersPanel";
import { ClimateAnalyticsPanel } from "@/components/ClimateAnalyticsPanel";
import { ClimateNotificationSettings } from "@/components/ClimateNotificationSettings";
import { getNetatmoWeatherStation, type WeatherStationResult } from "@/server/netatmo-weather";
import { getHomeySnapshot, type HomeyDeviceSnapshot } from "@/server/homey";
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

function useNetatmoTemps(stationMatch: string) {
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
    humidityIn: indoor?.metrics.humidity ?? null,
    co2: indoor?.metrics.co2 ?? null,
  };
}

type HeatPumpInfo = {
  name: string;
  zone: string;
  target: number | null;
  measure: number | null;
  onoff: boolean | null;
  mode?: string;
};

function isHeatPump(d: HomeyDeviceSnapshot, zoneName: string): boolean {
  const driver = (d.driverUri ?? "").toLowerCase();
  const n = `${d.name} ${zoneName}`.toLowerCase();
  return (
    driver.includes("qlima") ||
    n.includes("qlima") ||
    n.includes("varmepump") ||
    n.includes("heatpump") ||
    n.includes("heat pump") ||
    n.includes("klimaanlegg") ||
    n.includes("aircon") ||
    d.class === "airconditioning"
  );
}

function useHeatPumps() {
  const fetchSnapshot = useServerFn(getHomeySnapshot);
  const [pumps, setPumps] = useState<{ borg: HeatPumpInfo[]; hytta: HeatPumpInfo[] }>({
    borg: [],
    hytta: [],
  });
  const inFlight = useRef(false);

  useEffect(() => {
    let id: ReturnType<typeof setInterval>;
    const load = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const snap = await fetchSnapshot();
        if (snap.ok) {
          const zoneById = new Map(snap.zones.map((z) => [z.id, z.name]));
          const borg: HeatPumpInfo[] = [];
          const hytta: HeatPumpInfo[] = [];
          for (const d of snap.devices) {
            const zoneName = d.zone ? zoneById.get(d.zone) ?? "" : "";
            if (!isHeatPump(d, zoneName)) continue;
            const tt = d.capabilities["target_temperature"];
            const ms = d.capabilities["measure_temperature"];
            const oo = d.capabilities["onoff"];
            const md = d.capabilities["thermostat_mode"];
            const info: HeatPumpInfo = {
              name: d.name,
              zone: zoneName || "Ukjent",
              target: typeof tt?.value === "number" ? tt.value : null,
              measure: typeof ms?.value === "number" ? ms.value : null,
              onoff: typeof oo?.value === "boolean" ? oo.value : null,
              mode: typeof md?.value === "string" ? md.value : undefined,
            };
            const combined = `${zoneName} ${d.name}`.toLowerCase();
            const isHytta =
              combined.includes("hytt") ||
              driverIsQlima(d.driverUri) ||
              d.name.toLowerCase().includes("qlima");
            if (isHytta) hytta.push(info);
            else borg.push(info);
          }
          setPumps({ borg, hytta });
        }
      } catch {
        /* ignore */
      } finally {
        inFlight.current = false;
      }
    };
    load();
    id = setInterval(load, 3 * 60_000);
    return () => clearInterval(id);
  }, [fetchSnapshot]);

  return pumps;
}

function driverIsQlima(uri?: string | null) {
  return !!uri && uri.toLowerCase().includes("qlima");
}

function avg(nums: (number | null)[]): number | null {
  const xs = nums.filter((n): n is number => typeof n === "number");
  if (!xs.length) return null;
  return xs.reduce((s, n) => s + n, 0) / xs.length;
}

function modeAllowsHeat(mode?: string) {
  if (!mode) return true;
  const m = mode.toLowerCase();
  return m.includes("heat") || m.includes("auto") || m.includes("varm");
}
function modeAllowsCool(mode?: string) {
  if (!mode) return true;
  const m = mode.toLowerCase();
  return m.includes("cool") || m.includes("auto") || m.includes("kjøl") || m.includes("kjol");
}

function LocationBadge({
  label,
  icon: Icon,
  indoor,
  outdoor,
  target,
  canHeat,
  canCool,
}: {
  label: string;
  icon: typeof Castle;
  indoor: number | null;
  outdoor: number | null;
  target: number | null;
  canHeat: boolean;
  canCool: boolean;
}) {
  // Pil: respekter modus — opp kun hvis pumpa kan varme, ned kun hvis den kan kjøle.
  let Arrow: typeof Minus | null = Minus;
  let arrowColor = "var(--muted-foreground)";
  if (target !== null && indoor !== null) {
    const diff = target - indoor;
    if (diff >= 0.5) {
      if (canHeat) {
        Arrow = ArrowUp;
        arrowColor = "#fb923c";
      } else {
        Arrow = null;
      }
    } else if (diff <= -0.5) {
      if (canCool) {
        Arrow = ArrowDown;
        arrowColor = "#7dd3fc";
      } else {
        Arrow = null;
      }
    }
  }
  return (
    <div
      className="flex-1 min-w-[150px] rounded-xl px-3 py-2 backdrop-blur-md"
      style={{
        background: "color-mix(in oklab, var(--background) 45%, transparent)",
        border: "1px solid color-mix(in oklab, var(--gold) 40%, transparent)",
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-[var(--gold)]" />
        <span className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-display tabular-nums text-xl sm:text-2xl text-[var(--gold)]">
          {indoor === null ? "–" : `${indoor.toFixed(1)}°`}
        </span>
        {target !== null && (
          <span
            className="inline-flex items-center gap-0.5 text-xs tabular-nums"
            style={{ color: arrowColor }}
            title={`Varmepumpe satt til ${target.toFixed(1)}°`}
          >
            {Arrow && <Arrow size={12} />}
            {target.toFixed(0)}°
          </span>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5 flex items-center gap-1">
        <TreePine size={10} className="text-cyan-300/80" />
        Ute {outdoor === null ? "–" : `${outdoor.toFixed(1)}°`}
      </div>
    </div>
  );
}

function HeroTempBadges() {
  const borgT = useNetatmoTemps("tollnes");
  const hyttaT = useNetatmoTemps("hytta");
  const pumps = useHeatPumps();
  // Kun varmepumper som faktisk er PÅ skal påvirke pila / target i hero
  const borgOn = pumps.borg.filter((p) => p.onoff === true);
  const hyttaOn = pumps.hytta.filter((p) => p.onoff === true);
  const borgTarget = avg(borgOn.map((p) => p.target));
  const hyttaTarget = avg(hyttaOn.map((p) => p.target));
  const borgCanHeat = borgOn.some((p) => modeAllowsHeat(p.mode));
  const borgCanCool = borgOn.some((p) => modeAllowsCool(p.mode));
  const hyttaCanHeat = hyttaOn.some((p) => modeAllowsHeat(p.mode));
  const hyttaCanCool = hyttaOn.some((p) => modeAllowsCool(p.mode));
  return (
    <div className="flex flex-wrap gap-2 sm:gap-3 max-w-2xl">
      <LocationBadge
        label="Borgen"
        icon={Castle}
        indoor={borgT.indoor}
        outdoor={borgT.outdoor}
        target={borgTarget}
        canHeat={borgCanHeat}
        canCool={borgCanCool}
      />
      <LocationBadge
        label="Hytta"
        icon={Mountain}
        indoor={hyttaT.indoor}
        outdoor={hyttaT.outdoor}
        target={hyttaTarget}
        canHeat={hyttaCanHeat}
        canCool={hyttaCanCool}
      />
    </div>
  );
}

const TOC = [
  { id: "anbefalinger", label: "Smarte anbefalinger", icon: Sparkles },
  { id: "borg", label: "Borgen", icon: Castle },
  { id: "hytta", label: "Hytta", icon: Mountain },
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

type Tip = {
  text: string;
  tone: "warm" | "cold" | "ok" | "info";
  icon: typeof Sparkles;
  scope: "borg" | "hytta" | "begge";
};

function buildTips(args: {
  label: "Borgen" | "Hytta";
  scope: "borg" | "hytta";
  indoor: number | null;
  outdoor: number | null;
  humidity: number | null;
  co2: number | null;
  pumps: HeatPumpInfo[];
}): Tip[] {
  const { label, scope, indoor, outdoor, humidity, co2, pumps } = args;
  const tips: Tip[] = [];
  const target = avg(pumps.map((p) => p.target));
  const onPumps = pumps.filter((p) => p.onoff === true);
  const onCount = onPumps.length;
  const allOff = pumps.length > 0 && pumps.every((p) => p.onoff === false);
  const canHeatActive = onPumps.some((p) => modeAllowsHeat(p.mode));
  const canCoolActive = onPumps.some((p) => modeAllowsCool(p.mode));

  if (indoor !== null && outdoor !== null) {
    if (indoor > 24)
      tips.push({
        text: `${label}: stua er ${indoor.toFixed(1)}° — vurder å skru ned varmen et hakk.`,
        tone: "warm",
        icon: Flame,
        scope,
      });
    if (indoor < 19)
      tips.push({
        text: `${label}: stua er ${indoor.toFixed(1)}° — kanskje fyre opp varmepumpa?`,
        tone: "cold",
        icon: Snowflake,
        scope,
      });
    if (outdoor > 20 && indoor < outdoor)
      tips.push({
        text: `${label}: varmere ute enn inne (${outdoor.toFixed(1)}° vs ${indoor.toFixed(1)}°) — luft kort for å hente inn varmen.`,
        tone: "info",
        icon: Wind,
        scope,
      });
    if (outdoor < 5 && indoor > 22)
      tips.push({
        text: `${label}: kaldt ute (${outdoor.toFixed(1)}°) og varmt inne — sjekk om ovnene står høyere enn nødvendig.`,
        tone: "info",
        icon: Snowflake,
        scope,
      });
    if (outdoor > 25 && indoor > 25)
      tips.push({
        text: `${label}: hetebølge — start varmepumpa i kjøle-modus.`,
        tone: "warm",
        icon: Sun,
        scope,
      });
    if (outdoor < -5)
      tips.push({
        text: `${label}: streng kulde ute (${outdoor.toFixed(1)}°) — sjekk at frostvakter står på.`,
        tone: "cold",
        icon: Snowflake,
        scope,
      });
  }

  if (target !== null && indoor !== null) {
    const diff = target - indoor;
    if (diff > 3 && canHeatActive)
      tips.push({
        text: `${label}: varmepumpa er satt ${diff.toFixed(1)}° høyere enn romtemp — pumpa jobber hardt.`,
        tone: "warm",
        icon: ArrowUp,
        scope,
      });
    if (diff < -3 && canCoolActive)
      tips.push({
        text: `${label}: varmepumpa er satt ${Math.abs(diff).toFixed(1)}° under romtemp — kjøler aktivt.`,
        tone: "cold",
        icon: ArrowDown,
        scope,
      });
    if (target >= 24 && outdoor !== null && outdoor > 15)
      tips.push({
        text: `${label}: varmepumpe satt til ${target.toFixed(0)}° mens det er ${outdoor.toFixed(0)}° ute — vurder å senke målet.`,
        tone: "warm",
        icon: Flame,
        scope,
      });
  }

  if (allOff && outdoor !== null && outdoor < 0)
    tips.push({
      text: `${label}: alle varmepumper er av — med ${outdoor.toFixed(0)}° ute bør minst én stå på.`,
      tone: "cold",
      icon: Snowflake,
      scope,
    });

  if (onCount > 0 && indoor !== null && indoor >= (target ?? indoor) + 1)
    tips.push({
      text: `${label}: inne er ${indoor.toFixed(1)}° — målet er nådd, pumpa kan ta en pause.`,
      tone: "ok",
      icon: Minus,
      scope,
    });

  if (humidity !== null) {
    if (humidity > 65)
      tips.push({
        text: `${label}: luftfuktighet ${humidity.toFixed(0)}% — luft litt eller skru på avfukter.`,
        tone: "info",
        icon: Droplets,
        scope,
      });
    if (humidity < 25)
      tips.push({
        text: `${label}: tørr luft (${humidity.toFixed(0)}%) — vurder luftfukter.`,
        tone: "info",
        icon: Droplets,
        scope,
      });
  }

  if (co2 !== null && co2 > 1200)
    tips.push({
      text: `${label}: CO₂ ${co2} ppm — luft for friskere stue.`,
      tone: "info",
      icon: Wind,
      scope,
    });

  return tips;
}

function SmartAdvice() {
  const borg = useNetatmoTemps("tollnes");
  const hytta = useNetatmoTemps("hytta");
  const pumps = useHeatPumps();

  const tips = useMemo(() => {
    const all: Tip[] = [
      ...buildTips({
        label: "Borgen",
        scope: "borg",
        indoor: borg.indoor,
        outdoor: borg.outdoor,
        humidity: borg.humidityIn,
        co2: borg.co2,
        pumps: pumps.borg,
      }),
      ...buildTips({
        label: "Hytta",
        scope: "hytta",
        indoor: hytta.indoor,
        outdoor: hytta.outdoor,
        humidity: hytta.humidityIn,
        co2: hytta.co2,
        pumps: pumps.hytta,
      }),
    ];
    if (!all.length) {
      all.push({
        text: "Alt ser bra ut — temperaturer og varmepumper er i balanse.",
        tone: "ok",
        icon: Sparkles,
        scope: "begge",
      });
    }
    return all;
  }, [borg, hytta, pumps]);

  const toneStyle = (tone: Tip["tone"]) => {
    if (tone === "warm") return { color: "#fb923c", border: "color-mix(in oklab, #fb923c 35%, transparent)" };
    if (tone === "cold") return { color: "#7dd3fc", border: "color-mix(in oklab, #7dd3fc 35%, transparent)" };
    if (tone === "ok") return { color: "#86efac", border: "color-mix(in oklab, #86efac 35%, transparent)" };
    return { color: "var(--muted-foreground)", border: "color-mix(in oklab, var(--gold) 22%, transparent)" };
  };

  const borgTips = tips.filter((t) => t.scope === "borg" || t.scope === "begge");
  const hyttaTips = tips.filter((t) => t.scope === "hytta" || t.scope === "begge");

  const renderList = (list: Tip[], title: string, Icon: typeof Castle) => (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className="text-[var(--gold)]" />
        <span className="text-[10px] tracking-[0.3em] uppercase text-primary">{title}</span>
      </div>
      <ul className="space-y-2">
        {list.length === 0 && (
          <li className="text-xs text-muted-foreground italic">Ingen anbefalinger akkurat nå.</li>
        )}
        {list.map((t, i) => {
          const s = toneStyle(t.tone);
          const I = t.icon;
          return (
            <li
              key={i}
              className="panel rounded-lg p-3 flex items-start gap-3"
              style={{ border: `1px solid ${s.border}` }}
            >
              <I size={14} style={{ color: s.color }} className="shrink-0 mt-0.5" />
              <span className="text-sm" style={{ color: s.color }}>
                {t.text}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const [open, setOpen] = useState(false);
  const totalCount = borgTips.length + hyttaTips.length;

  return (
    <section id="anbefalinger" className="container mx-auto px-4 py-8 scroll-mt-20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full ornate-divider mb-6 flex items-center justify-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
        aria-expanded={open}
      >
        <Sparkles size={14} className="text-[var(--gold)]" />
        <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
          Smarte anbefalinger
        </span>
        {totalCount > 0 && (
          <span className="text-[10px] tabular-nums text-muted-foreground">
            ({totalCount})
          </span>
        )}
        <ChevronRight
          size={14}
          className="text-muted-foreground transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        />
      </button>
      {open && (
        <div className="grid md:grid-cols-2 gap-6">
          {renderList(borgTips, "Borgen", Castle)}
          {renderList(hyttaTips, "Hytta", Mountain)}
        </div>
      )}
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
      <ClimateAnalyticsPanel stationMatch="tollnes" title="Borgen — klimaanalyse" />

      <div id="hytta" className="scroll-mt-20" />
      <HeatersPanel
        location="hytta"
        title="Hytta — varme & klima"
        emptyHint="Ingen varme- eller klimaenheter på hytta ennå."
      />
      <ClimateAnalyticsPanel stationMatch="hytta" title="Hytta — klimaanalyse" />

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
