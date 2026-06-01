import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell, PageHero } from "@/components/PageShell";
import { LastUpdated } from "@/components/LastUpdated";
import { LivePollen } from "@/components/LivePollen";
import { AirQualityPanel } from "@/components/AirQualityPanel";
import { UvCloudPanel } from "@/components/UvCloudPanel";
import { useUserLocation, UserLocationBar } from "@/hooks/use-user-location";
import heroImg from "@/assets/got-pollen.jpg";

export const Route = createFileRoute("/pollen")({
  head: () => ({
    meta: [
      { title: "Luftkvalitet | House Pettersen Riis" },
      {
        name: "description",
        content:
          "Luftkvalitet for Skien og hytta i Numedal — pollen, UV, svevestøv, ozon og gasser time-for-time fra Open-Meteo.",
      },
      { property: "og:title", content: "Luftkvalitet | House Pettersen Riis" },
      {
        property: "og:description",
        content:
          "Pollen, UV, svevestøv (PM2.5/PM10), NO₂, O₃, SO₂, CO og mineralstøv — live fra Open-Meteo.",
      },
    ],
  }),
  component: PollenPage,
});

// ─────────────────────────────────────────────────────────────────────────────
// Allergen catalogue — sesongprofil per måned (1–12), 0–100
// ─────────────────────────────────────────────────────────────────────────────

type Allergen = {
  key: string;
  name: string;
  latin: string;
  sigil: string;       // emoji som "våpenskjold"
  house: string;       // GoT-flavor-tekst
  description: string;
  tips: string;
  // Måned → intensitet 0..100, for hver region
  skien: number[];     // length 12
  hytta: number[];     // length 12
};

const ALLERGENS: Allergen[] = [
  {
    key: "or",
    name: "Or",
    latin: "Alnus",
    sigil: "🌫",
    house: "Husene fra Tidlig Vår",
    description: "Først ute av alle. Or starter ofte allerede i februar når snøen ennå ligger.",
    tips: "Hold vinduer lukket på solrike vintermorgener. Briller utendørs.",
    skien: [10, 70, 85, 30, 5, 0, 0, 0, 0, 0, 0, 5],
    hytta: [5, 25, 75, 60, 10, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    key: "hassel",
    name: "Hassel",
    latin: "Corylus",
    sigil: "🌰",
    house: "Husene fra Tidlig Vår",
    description: "Følger or tett. Korte, intense topper i februar–mars.",
    tips: "Skyll håret før leggetid, vask sengetøy ofte i sesongen.",
    skien: [15, 60, 70, 20, 5, 0, 0, 0, 0, 0, 0, 5],
    hytta: [5, 20, 55, 50, 10, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    key: "salix",
    name: "Salix",
    latin: "Salix (selje/vier)",
    sigil: "🌿",
    house: "Husene fra Vår",
    description: "Selje og vier blomstrer i april–mai. Lokalt sterk hvor det vokser tett.",
    tips: "Unngå turer langs bekker og våtmark i blomstring.",
    skien: [0, 5, 20, 55, 50, 10, 0, 0, 0, 0, 0, 0],
    hytta: [0, 0, 10, 45, 60, 25, 0, 0, 0, 0, 0, 0],
  },
  {
    key: "bjork",
    name: "Bjørk",
    latin: "Betula",
    sigil: "🌳",
    house: "House Birch — den største plagen",
    description: "Norges vanligste pollenallergi. Eksplosjon i mai, ofte også april i lavlandet.",
    tips: "Kraftig antihistamin før topp. Vurder nesespray. Tørk klær inne.",
    skien: [0, 0, 5, 70, 95, 35, 5, 0, 0, 0, 0, 0],
    hytta: [0, 0, 0, 35, 90, 70, 15, 0, 0, 0, 0, 0],
  },
  {
    key: "gress",
    name: "Gress",
    latin: "Poaceae",
    sigil: "🌾",
    house: "Husene fra Sommer",
    description: "Lang sesong fra slutten av mai til august. Topp ofte i juni–juli.",
    tips: "Ikke klipp plenen selv. Dusj etter utetid. Lukk soveromsvindu om natta.",
    skien: [0, 0, 0, 5, 45, 85, 80, 50, 15, 0, 0, 0],
    hytta: [0, 0, 0, 0, 25, 75, 85, 55, 20, 0, 0, 0],
  },
  {
    key: "burot",
    name: "Burot",
    latin: "Artemisia",
    sigil: "🍂",
    house: "Husene fra Sensommer",
    description: "Sterkest i kystnære områder med mye burot-vegetasjon. Mindre i innlandet.",
    tips: "Unngå brakkmark og veikanter på ettermiddagen.",
    skien: [0, 0, 0, 0, 0, 5, 55, 70, 35, 5, 0, 0],
    hytta: [0, 0, 0, 0, 0, 0, 20, 30, 15, 0, 0, 0],
  },
];

// Allergener Arne reagerer på — fremheves i UI
const MY_ALLERGEN_KEYS = new Set(["bjork", "gress", "or", "burot"]);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Des"];

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

function PollenPage() {
  const month = new Date().getMonth(); // 0..11
  const [loadedAt, setLoadedAt] = useState(() => new Date());
  const userLoc = useUserLocation("pollen");

  // Bump "lastet"-tid hver time slik at pillen reflekterer at vi har refresh-loop
  useEffect(() => {
    const id = setInterval(() => setLoadedAt(new Date()), 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <PageShell>
      <PageHero
        eyebrow="Skien & Numedal · Norge"
        title="Luftkvalitet"
        subtitle="Pollen, UV, svevestøv, ozon og gasser — time-for-time fra Open-Meteo."
        image={heroImg}
      />

      <section className="container mx-auto px-4 pt-6 flex flex-col items-center gap-3">
        <LastUpdated label="Luftkvalitet (sidelast)" timestamp={loadedAt} />
        <p className="max-w-2xl text-center text-xs text-muted-foreground leading-relaxed">
          Samlet oversikt over alt som påvirker lufta du puster inn: pollen
          (bjørk, gress, or, burot m.fl.), UV-stråling, svevestøv (PM2.5 og
          PM10), bakkenært ozon (O₃), nitrogendioksid (NO₂), svoveldioksid
          (SO₂), karbonmonoksid (CO) og mineralstøv. Alle målinger hentes live
          fra Open-Meteo og oppdateres hver halvtime.
        </p>
        <div className="panel rounded-md px-4 py-2 flex items-center gap-2 text-xs">
          <span className="text-primary">⚔</span>
          <span className="text-muted-foreground">
            Allergener merket med <span className="text-primary">⚔</span> plager Arne:{" "}
            <span className="text-foreground">bjørk, gress, or, burot</span>
          </span>
        </div>
      </section>

      <section className="container mx-auto px-4 pt-8 space-y-5">
        <UserLocationBar page="pollen" state={userLoc} readOnlyWho />
      </section>

      <section className="container mx-auto px-4 py-10 space-y-12">
        {/* Air quality — AQI, UV, dust, gases */}
        <div>
          <SectionHeader
            eyebrow="Live luftkvalitet · Open-Meteo"
            title="Akkurat nå i lufta"
          />
          <div className="grid lg:grid-cols-2 gap-6 mt-6">
            {userLoc.ready && (
              <AirQualityPanel
                key={`aq-${userLoc.active.lat}-${userLoc.active.lon}`}
                lat={userLoc.active.lat}
                lon={userLoc.active.lon}
                title={userLoc.active.label}
                subtitle="AQI, UV, svevestøv, ozon og gasser"
              />
            )}
            <AirQualityPanel
              lat={59.91}
              lon={9.07}
              title="Hytta · Lyngdal i Numedal"
              subtitle="Renere fjell-luft — sammenlign med byen"
            />
          </div>
        </div>

        {/* UV med og uten skydekke */}
        <div>
          <SectionHeader
            eyebrow="UV-prognose · Open-Meteo"
            title="UV med og uten skydekke"
          />
          <div className="grid lg:grid-cols-2 gap-6 mt-6">
            {userLoc.ready && (
              <UvCloudPanel
                key={`uv-${userLoc.active.lat}-${userLoc.active.lon}`}
                lat={userLoc.active.lat}
                lon={userLoc.active.lon}
                title={userLoc.active.label}
                subtitle="Klikk grafen for detaljert visning"
              />
            )}
            <UvCloudPanel
              lat={59.91}
              lon={9.07}
              title="Hytta · Lyngdal i Numedal"
              subtitle="Klar himmel-UV vs faktisk UV"
            />
          </div>
        </div>

        {/* LIVE — what's flying right now, hourly forecast */}
        <div>
          <SectionHeader
            eyebrow="Live målinger · Open-Meteo"
            title="Pollen — hva som flyr akkurat nå"
          />
          <div className="grid lg:grid-cols-2 gap-6 mt-6">
            {userLoc.ready && (
              <LivePollen
                key={`${userLoc.active.lat}-${userLoc.active.lon}`}
                lat={userLoc.active.lat}
                lon={userLoc.active.lon}
                title={userLoc.active.label}
                subtitle="Live pollen for valgt sted — oppdateres hver time"
                naafRegion="ostlandetMedOslo"
              />
            )}
            <LivePollen
              lat={59.91}
              lon={9.07}
              title="Hytta · Lyngdal i Numedal"
              subtitle="Live pollen for Numedal — sesongen kommer 1–2 uker senere"
              naafRegion="indreOstlandet"
            />

          </div>
        </div>

        {/* Year heatmap */}
        <YearHeatmap region="skien" title="Skien · Tollnes" subtitle="Måned-for-måned belastning" />
        <YearHeatmap region="hytta" title="Hytta · Lyngdal i Numedal" subtitle="Sesongen kommer 1–2 uker senere" />

        {/* Curves */}
        <SeasonCurves />

        {/* Allergen detail cards */}
        <AllergenCodex month={month} />

        {/* Tips & alerts */}
        <TipsPanel />
      </section>
    </PageShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Today panel — hva er aktivt nå
// ─────────────────────────────────────────────────────────────────────────────

function TodayPanel({ month, monthLabel }: { month: number; monthLabel: string }) {
  const skienActive = ALLERGENS
    .map((a) => ({ a, v: a.skien[month] }))
    .filter((x) => x.v > 0)
    .sort((x, y) => y.v - x.v);
  const hyttaActive = ALLERGENS
    .map((a) => ({ a, v: a.hytta[month] }))
    .filter((x) => x.v > 0)
    .sort((x, y) => y.v - x.v);

  return (
    <div>
      <SectionHeader eyebrow={`Nåværende måned · ${monthLabel}`} title="Hva som flyr i dag" />
      <div className="grid md:grid-cols-2 gap-6 mt-6">
        <RegionToday title="Skien · Tollnes" items={skienActive} />
        <RegionToday title="Hytta · Lyngdal i Numedal" items={hyttaActive} />
      </div>
    </div>
  );
}

function RegionToday({
  title,
  items,
}: {
  title: string;
  items: { a: Allergen; v: number }[];
}) {
  return (
    <article className="panel rounded-lg p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-display text-lg text-primary tracking-wider uppercase">{title}</h3>
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          NAAF-estimat
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Vinteren råder. Ingen aktive allergener nå.
        </p>
      ) : (
        <div className="space-y-2.5">
          {items.map(({ a, v }) => {
            const lvl = levelFor(v);
            return (
              <div key={a.key} className="flex items-center gap-3">
                <span className="text-2xl w-8 text-center">{a.sigil}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-foreground">{a.name}</span>
                    <span
                      className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border"
                      style={{ borderColor: lvl.color, color: lvl.color }}
                    >
                      {lvl.label}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${v}%`, backgroundColor: lvl.color }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Year heatmap — kalender per allergen × måned
// ─────────────────────────────────────────────────────────────────────────────

function YearHeatmap({
  region,
  title,
  subtitle,
}: {
  region: "skien" | "hytta";
  title: string;
  subtitle: string;
}) {
  const currentMonth = new Date().getMonth();

  return (
    <div>
      <SectionHeader eyebrow={subtitle} title={title} />
      <div className="panel rounded-lg p-4 md:p-6 mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className="text-left text-[10px] uppercase tracking-[0.2em] text-muted-foreground pb-2 pr-3">
                Allergen
              </th>
              {MONTHS.map((m, i) => (
                <th
                  key={m}
                  className={`text-center text-[10px] uppercase tracking-wider pb-2 ${
                    i === currentMonth ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALLERGENS.map((a) => {
              const row = a[region];
              const isMine = MY_ALLERGEN_KEYS.has(a.key);
              return (
                <tr key={a.key} className="border-t border-border/50">
                  <td className="py-1.5 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{a.sigil}</span>
                      <div className="leading-tight">
                        <div className="text-sm text-foreground flex items-center gap-1">
                          {a.name}
                          {isMine && (
                            <span className="text-primary text-xs" title="Plager Arne">⚔</span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground italic">
                          {a.latin}
                        </div>
                      </div>
                    </div>
                  </td>
                  {row.map((v, i) => {
                    const lvl = levelFor(v);
                    const isCurrent = i === currentMonth;
                    return (
                      <td key={i} className="p-0.5">
                        <div
                          className={`h-7 rounded-sm flex items-center justify-center text-[10px] font-medium ${
                            isCurrent ? "ring-1 ring-primary" : ""
                          }`}
                          style={{
                            backgroundColor: v === 0 ? "var(--muted)" : lvl.color,
                            opacity: v === 0 ? 0.3 : Math.max(0.35, v / 100),
                            color: v >= 50 ? "oklch(0.14 0.01 240)" : "var(--muted-foreground)",
                          }}
                          title={`${a.name} · ${MONTHS[i]} · ${v}%`}
                        >
                          {v >= 30 ? v : ""}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-border/50">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Nivå
          </span>
          {[
            { label: "Ingen", color: "oklch(0.55 0.04 240)" },
            { label: "Lav", color: "oklch(0.72 0.15 140)" },
            { label: "Moderat", color: "oklch(0.78 0.15 70)" },
            { label: "Høy", color: "oklch(0.65 0.20 25)" },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: l.color }} />
              <span className="text-xs text-muted-foreground">{l.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Season curves — SVG line chart med flere allergener
// ─────────────────────────────────────────────────────────────────────────────

function SeasonCurves() {
  const currentMonth = new Date().getMonth();

  return (
    <div>
      <SectionHeader
        eyebrow="Sesongkurver"
        title="Når kommer de — og når går de?"
      />
      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <CurveChart title="Skien · Tollnes" region="skien" currentMonth={currentMonth} />
        <CurveChart title="Hytta · Numedal" region="hytta" currentMonth={currentMonth} />
      </div>
    </div>
  );
}

function CurveChart({
  title,
  region,
  currentMonth,
}: {
  title: string;
  region: "skien" | "hytta";
  currentMonth: number;
}) {
  const W = 600;
  const H = 220;
  const padL = 30;
  const padR = 10;
  const padT = 10;
  const padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const stepX = innerW / 11;

  const xFor = (i: number) => padL + i * stepX;
  const yFor = (v: number) => padT + innerH - (v / 100) * innerH;

  return (
    <article className="panel rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-display text-base text-primary tracking-wider uppercase">{title}</h3>
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          intensitet 0–100
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {/* Grid */}
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line
              x1={padL}
              x2={W - padR}
              y1={yFor(g)}
              y2={yFor(g)}
              stroke="var(--border)"
              strokeWidth="0.5"
              strokeDasharray="2 3"
            />
            <text
              x={padL - 4}
              y={yFor(g) + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize="9"
            >
              {g}
            </text>
          </g>
        ))}

        {/* Current month marker */}
        <line
          x1={xFor(currentMonth)}
          x2={xFor(currentMonth)}
          y1={padT}
          y2={padT + innerH}
          stroke="var(--primary)"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.5"
        />

        {/* X labels */}
        {MONTHS.map((m, i) => (
          <text
            key={m}
            x={xFor(i)}
            y={H - 6}
            textAnchor="middle"
            className={i === currentMonth ? "fill-primary" : "fill-muted-foreground"}
            fontSize="9"
          >
            {m}
          </text>
        ))}

        {/* Curves */}
        {ALLERGENS.map((a) => {
          const data = a[region];
          const path = data
            .map((v, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(v)}`)
            .join(" ");
          const color = allergenColor(a.key);
          return (
            <g key={a.key}>
              <path d={path} fill="none" stroke={color} strokeWidth="2" opacity="0.85" />
              {data.map((v, i) =>
                v > 0 ? (
                  <circle
                    key={i}
                    cx={xFor(i)}
                    cy={yFor(v)}
                    r={i === currentMonth ? 3 : 1.8}
                    fill={color}
                  />
                ) : null,
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3 pt-3 border-t border-border/50">
        {ALLERGENS.map((a) => {
          const isMine = MY_ALLERGEN_KEYS.has(a.key);
          return (
            <div key={a.key} className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: allergenColor(a.key) }}
              />
              <span
                className={`text-xs ${isMine ? "text-foreground font-medium" : "text-muted-foreground"}`}
              >
                {a.name}
                {isMine && <span className="text-primary ml-0.5">⚔</span>}
              </span>
            </div>
          );
        })}
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Allergen codex — detaljkort med GoT-stil
// ─────────────────────────────────────────────────────────────────────────────

function AllergenCodex({ month }: { month: number }) {
  return (
    <div>
      <SectionHeader
        eyebrow="Allergenenes Kodeks"
        title="Husene som plager"
      />
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
        {ALLERGENS.map((a) => {
          const skienNow = a.skien[month];
          const hyttaNow = a.hytta[month];
          const peakSkien = peakMonth(a.skien);
          const peakHytta = peakMonth(a.hytta);
          return (
            <article
              key={a.key}
              className={`panel rounded-lg p-5 glow-on-hover flex flex-col ${
                MY_ALLERGEN_KEYS.has(a.key) ? "ring-1 ring-primary/40" : ""
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-3xl mb-1">{a.sigil}</div>
                  <h3 className="text-display text-lg text-primary tracking-wider uppercase flex items-center gap-2">
                    {a.name}
                    {MY_ALLERGEN_KEYS.has(a.key) && (
                      <span className="text-sm" title="Plager Arne">⚔</span>
                    )}
                  </h3>
                  <p className="text-[11px] italic text-muted-foreground">{a.latin}</p>
                </div>
                <div
                  className="h-10 w-10 rounded-full border-2 flex items-center justify-center text-xs font-bold"
                  style={{
                    borderColor: allergenColor(a.key),
                    color: allergenColor(a.key),
                  }}
                >
                  {Math.max(skienNow, hyttaNow)}
                </div>
              </div>

              <p className="text-xs uppercase tracking-[0.2em] text-primary/70 mb-2">
                {a.house}
              </p>
              <p className="text-sm text-muted-foreground mb-3">{a.description}</p>

              <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                <RegionMini label="Skien" now={skienNow} peak={peakSkien} />
                <RegionMini label="Hytta" now={hyttaNow} peak={peakHytta} />
              </div>

              <div className="mt-auto pt-3 border-t border-border/50">
                <p className="text-[10px] uppercase tracking-[0.2em] text-primary/70 mb-1">
                  Maesterens råd
                </p>
                <p className="text-xs text-foreground/90">{a.tips}</p>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function RegionMini({
  label,
  now,
  peak,
}: {
  label: string;
  now: number;
  peak: { month: number; value: number };
}) {
  const lvl = levelFor(now);
  return (
    <div className="rounded-md border border-border/50 p-2 bg-background/40">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-foreground font-semibold">{now}</span>
        <span className="text-[10px]" style={{ color: lvl.color }}>
          {lvl.label}
        </span>
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">
        Topp: {MONTHS[peak.month]} ({peak.value})
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tips
// ─────────────────────────────────────────────────────────────────────────────

function TipsPanel() {
  const tips = [
    {
      icon: "🌬",
      title: "Vinden bærer pollen",
      body: "Tørr og varm vind = mer pollen i luften. Hold soveromsvinduet lukket på slike dager.",
    },
    {
      icon: "🚿",
      title: "Skyll det vekk",
      body: "Dusj og skift klær når du kommer hjem. Pollen sitter i hår og på stoff.",
    },
    {
      icon: "💊",
      title: "Start tidlig",
      body: "Antihistamin virker best forebyggende. Start 1–2 uker før din topp.",
    },
    {
      icon: "🧺",
      title: "Tørk inne i sesongen",
      body: "Klær tørket ute samler pollen — særlig i bjørke- og gress-toppen.",
    },
    {
      icon: "🌧",
      title: "Regn renser luften",
      body: "Etter regn er pollennivået lavt — perfekt tid for utetid.",
    },
    {
      icon: "🏔",
      title: "Hytta er senere",
      body: "I Numedal kommer toppene 1–2 uker etter Skien. Bra fluktrute mellom rundene.",
    },
  ];

  return (
    <div>
      <SectionHeader eyebrow="Maesterens kammer" title="Råd for å overleve sesongen" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {tips.map((t) => (
          <div
            key={t.title}
            className="panel rounded-lg p-5 glow-on-hover"
          >
            <div className="text-3xl mb-2">{t.icon}</div>
            <h3 className="text-display text-base text-primary tracking-wider uppercase mb-1">
              {t.title}
            </h3>
            <p className="text-sm text-muted-foreground">{t.body}</p>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-8 italic">
        Estimat basert på typiske sesonger (NAAF). For sanntid se{" "}
        <a
          href="https://www.naaf.no/pollenvarsel"
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          naaf.no/pollenvarsel
        </a>
        .
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <div className="ornate-divider mb-3">
        <span className="text-display tracking-[0.3em] text-primary text-xs uppercase">
          {eyebrow}
        </span>
      </div>
      <h2 className="text-display text-2xl md:text-3xl text-foreground tracking-wider uppercase text-center">
        {title}
      </h2>
    </div>
  );
}

function levelFor(v: number): { label: string; color: string } {
  if (v >= 70) return { label: "Høy", color: "oklch(0.65 0.20 25)" };
  if (v >= 40) return { label: "Moderat", color: "oklch(0.78 0.15 70)" };
  if (v >= 10) return { label: "Lav", color: "oklch(0.72 0.15 140)" };
  return { label: "Ingen", color: "oklch(0.55 0.04 240)" };
}

function peakMonth(arr: number[]): { month: number; value: number } {
  let m = 0;
  let v = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > v) {
      v = arr[i];
      m = i;
    }
  }
  return { month: m, value: v };
}

function allergenColor(key: string): string {
  switch (key) {
    case "or":
      return "oklch(0.70 0.14 50)";
    case "hassel":
      return "oklch(0.62 0.13 35)";
    case "salix":
      return "oklch(0.72 0.14 130)";
    case "bjork":
      return "oklch(0.78 0.16 90)";
    case "gress":
      return "oklch(0.68 0.18 145)";
    case "burot":
      return "oklch(0.60 0.18 25)";
    default:
      return "oklch(0.70 0.10 240)";
  }
}
