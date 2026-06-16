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
        Fornavn: [
          "1EMMA",
          "1NORA / NORAH",
          "1OLIVIA",
          "1SOFIE / SOPHIE",
          "1EMILIA / EMELIA",
        ],
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
      title: "Månedslønn — etter kjønn, desil og sektor",
      description:
        "Gjennomsnittlig månedslønn for heltidsansatte. Filtrer på kjønn, sektor og lønnsdesil.",
      xAxis: "Tid",
      series: "Kjonn",
      defaultSeriesTopN: 3,
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
