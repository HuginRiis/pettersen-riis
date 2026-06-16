import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SsbExplorer, type SsbExplorerConfig } from "@/components/SsbExplorer";
import { Button } from "@/components/ui/button";
import { BarChart3 } from "lucide-react";

export const Route = createFileRoute("/ssb-statistikk")({
  component: SsbStatistikkPage,
  head: () => ({
    meta: [
      { title: "Norges-statistikk fra SSB — Arne & Rebekka av Skien" },
      {
        name: "description",
        content:
          "Utforsk statistikk fra Statistisk sentralbyrå: navn, lønn, sykefravær, befolkning, bil og bolig — med rike filtre.",
      },
    ],
  }),
});

type TabKey =
  | "fornavn"
  | "etternavn"
  | "lonn"
  | "syke"
  | "befolkning"
  | "bil"
  | "bolig"
  | "kpi"
  | "flytting"
  | "innvandring"
  | "husholdninger"
  | "arbeidsledighet"
  | "bef-endring"
  | "tettsteder"
  | "folke-beregnet"
  | "kpi-mnd"
  | "folke-alder"
  | "gebyrer";

const TABS: { key: TabKey; label: string; config: SsbExplorerConfig }[] = [
  {
    key: "fornavn",
    label: "Fornavn",
    config: {
      tableId: "10467",
      title: "Mest brukte fornavn til nyfødte",
      description:
        "Antall nyfødte gitt et fornavn, per år. Søk etter navn i filteret og sammenlign trender.",
      xAxis: "Tid",
      series: "Fornavn",
      defaultSelection: {
        Fornavn: ["1EMMA", "1NORA", "1OLIVIA", "1SOFIE", "1EMILIA"],
      },
      defaultSeriesTopN: 5,
    },
  },
  {
    key: "etternavn",
    label: "Etternavn",
    config: {
      tableId: "12891",
      title: "Mest brukte etternavn (200+ personer)",
      description:
        "Antall personer per etternavn. Søk etter slekta di, eller sammenlign de største navnene.",
      xAxis: "Tid",
      series: "Etternavn",
      defaultSelection: {
        Etternavn: ["HANSEN", "JOHANSEN", "OLSEN", "LARSEN", "ANDERSEN"],
      },
      defaultSeriesTopN: 5,
    },
  },
  {
    key: "lonn",
    label: "Lønn",
    config: {
      tableId: "11423",
      title: "Månedslønn — etter kjønn, desil og sektor (2010–2026)",
      description:
        "Gjennomsnittlig månedslønn for heltidsansatte fra 2010 og fram til siste tilgjengelige år (inkl. 2026 når SSB publiserer). Filtrer på kjønn, sektor og lønnsdesil.",
      xAxis: "Tid",
      series: "Kjonn",
      defaultSeriesTopN: 3,
      xAxisFrom: "2010",
    },
  },
  {
    key: "syke",
    label: "Sykefravær",
    config: {
      tableId: "12441",
      title: "Sykefravær for lønnstakere",
      description:
        "Sykefraværsprosent etter kjønn, næring og type fravær (egenmeldt vs legemeldt).",
      xAxis: "Tid",
      series: "Kjonn",
      defaultSeriesTopN: 3,
    },
  },
  {
    key: "befolkning",
    label: "Befolkning",
    config: {
      tableId: "10826",
      title: "Folkemengde — region, alder og kjønn",
      description:
        "Antall personer bosatt i Norge, fylker eller kommuner. Bryt ned på alder og kjønn.",
      xAxis: "Tid",
      series: "Kjonn",
      defaultSeriesTopN: 3,
    },
  },
  {
    key: "bil",
    label: "Bil",
    config: {
      tableId: "11823",
      title: "Registrerte kjøretøy — drivstoff og euroklasse",
      description:
        "Antall personbiler i Norge per drivstofftype og utslippsklasse. Følg overgangen til el.",
      xAxis: "Tid",
      series: "DrivstoffType",
      defaultSeriesTopN: 6,
    },
  },
  {
    key: "bolig",
    label: "Bolig",
    config: {
      tableId: "06513",
      title: "Boliger — region, bygningstype og bruksareal",
      description:
        "Boligbestanden i Norge, etter bygningstype (enebolig, blokk, rekkehus) og størrelse.",
      xAxis: "Tid",
      series: "Bygningstype",
      defaultSeriesTopN: 6,
    },
  },
  {
    key: "kpi",
    label: "Populært (KPI)",
    config: {
      tableId: "03014",
      title: "Konsumprisindeksen — det folk googler",
      description:
        "Prisendringer på alt fra mat til strøm. Den mest brukte SSB-statistikken i nyhetene.",
      xAxis: "Tid",
      series: "Konsumgrp",
      defaultSeriesTopN: 4,
    },
  },
  {
    key: "flytting",
    label: "Flytting",
    config: {
      tableId: "09588",
      title: "Inn- og utflytting per region",
      description:
        "Hvor mange flytter inn og ut av hver kommune og fylke — og hvem har størst nettoinnflytting?",
      xAxis: "Tid",
      series: "ContentsCode",
      defaultSeriesTopN: 4,
    },
  },
  {
    key: "innvandring",
    label: "Innvandring",
    config: {
      tableId: "09817",
      title: "Innvandrere og norskfødte med innvandrerforeldre",
      description:
        "Antall innvandrere etter landbakgrunn og kategori. Filtrer på region og landgruppe.",
      xAxis: "Tid",
      series: "InnvandrKat",
      defaultSeriesTopN: 3,
    },
  },
  {
    key: "husholdninger",
    label: "Husholdninger",
    config: {
      tableId: "11084",
      title: "Husholdninger etter eierstatus",
      description:
        "Andel som eier vs leier bolig — fordelt på region og eierform (selveier, andelseier, leier).",
      xAxis: "Tid",
      series: "EierStatus",
      defaultSeriesTopN: 4,
    },
  },
  {
    key: "arbeidsledighet",
    label: "Arbeidsledighet",
    config: {
      tableId: "08517",
      title: "Arbeidsledige etter kjønn og alder",
      description:
        "Registrerte arbeidsledige i Norge. Følg konjunkturene gjennom 50 år.",
      xAxis: "Tid",
      series: "Kjonn",
      defaultSeriesTopN: 3,
    },
  },
  {
    key: "bef-endring",
    label: "Fødte & døde",
    config: {
      tableId: "05803",
      title: "Endringer i befolkningen",
      description:
        "Fødte, døde, ekteskap, skilsmisser og netto innvandring — Norges befolkningsdynamikk siden 1735.",
      xAxis: "Tid",
      series: "ContentsCode",
      defaultSeriesTopN: 5,
    },
  },
  {
    key: "tettsteder",
    label: "Tettsteder",
    config: {
      tableId: "04861",
      title: "Areal og befolkning i tettsteder",
      description:
        "Hvor mange bor i tettsteder, og hvor stort er hvert tettsted? Filtrer på region.",
      xAxis: "Tid",
      series: "ContentsCode",
      defaultSeriesTopN: 2,
    },
  },
  {
    key: "folke-beregnet",
    label: "Folketall (prognose)",
    config: {
      tableId: "05231",
      title: "Beregnet folkemengde",
      description:
        "SSBs framskrivinger og beregnede folketall per region.",
      xAxis: "Tid",
      series: "ContentsCode",
      defaultSeriesTopN: 3,
    },
  },
  {
    key: "kpi-mnd",
    label: "KPI månedlig",
    config: {
      tableId: "03013",
      title: "Konsumprisindeksen — månedstall",
      description:
        "Detaljerte KPI-tall per måned. Følg inflasjonen tett, gruppe for gruppe.",
      xAxis: "Tid",
      series: "ContentsCode",
      defaultSeriesTopN: 3,
    },
  },
  {
    key: "folke-alder",
    label: "Folkemengde alder",
    config: {
      tableId: "05277",
      title: "Folkemengde etter aldersgruppe",
      description:
        "Befolkningen brutt ned på aldersgrupper og kjønn — per kommune og fylke.",
      xAxis: "Tid",
      series: "Alder",
      defaultSeriesTopN: 6,
    },
  },
  {
    key: "gebyrer",
    label: "Kommunale gebyrer",
    config: {
      tableId: "12842",
      title: "Kommunale gebyrer for bolig",
      description:
        "Hva betaler du i renovasjon, vann, avløp og feiing i din kommune?",
      xAxis: "Tid",
      series: "ContentsCode",
      defaultSeriesTopN: 4,
    },
  },
];

function SsbStatistikkPage() {
  const [tab, setTab] = useState<TabKey>("fornavn");
  const active = TABS.find((t) => t.key === tab)!;

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-black text-zinc-100">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6 flex items-center gap-3">
          <BarChart3 className="h-8 w-8 text-amber-400" />
          <div>
            <h1 className="font-cinzel text-3xl text-amber-200">
              Norges-statistikk
            </h1>
            <p className="text-sm text-zinc-400">
              Direkte fra Statistisk sentralbyrå (data.ssb.no) — filtrer, sammenlign
              og utforsk.
            </p>
          </div>
        </header>

        <nav className="mb-6 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={tab === t.key ? "default" : "outline"}
              className={
                tab === t.key
                  ? "bg-amber-600 text-zinc-950 hover:bg-amber-500"
                  : "border-amber-900/40 text-amber-200 hover:bg-amber-900/20"
              }
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </Button>
          ))}
        </nav>

        <SsbExplorer key={active.key} config={active.config} />

        <footer className="mt-8 text-center text-xs text-zinc-500">
          Kilde: Statistisk sentralbyrå (SSB). Data hentes live fra{" "}
          <a
            href="https://data.ssb.no/api/v0/no/table/"
            target="_blank"
            rel="noreferrer"
            className="text-amber-400 underline"
          >
            data.ssb.no
          </a>
          .
        </footer>
      </main>
    </div>
  );
}
