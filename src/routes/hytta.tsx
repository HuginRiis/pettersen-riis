import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";
import { HyttaHero } from "@/components/HyttaHero";
import { HyttaChecklist } from "@/components/HyttaChecklist";
import { NetatmoWeatherStationSection } from "@/components/NetatmoWeatherStation";
import { HeatersPanel } from "@/components/HeatersPanel";
import { HyttaIndreSal } from "@/components/HyttaIndreSal";
import { useAuthStatus } from "@/hooks/use-auth-status";

import hyttaImg from "@/assets/hytta-aurora.jpg";
import g0314 from "@/assets/hytta-gallery/0314.jpg";
import g0342 from "@/assets/hytta-gallery/0342.jpg";
import g0851 from "@/assets/hytta-gallery/0851.jpg";
import g0853 from "@/assets/hytta-gallery/0853.jpg";
import g1776 from "@/assets/hytta-gallery/1776.jpg";
import g1801 from "@/assets/hytta-gallery/1801.jpg";
import g1802 from "@/assets/hytta-gallery/1802.jpg";
import g1820 from "@/assets/hytta-gallery/1820.jpg";
import g1821 from "@/assets/hytta-gallery/1821.jpg";
import g1951 from "@/assets/hytta-gallery/1951.jpg";

type Plate = {
  src: string;
  house: string;
  title: string;
  caption: string;
  span?: "wide" | "tall" | "normal";
};

const GALLERY: Plate[] = [
  {
    src: g1820,
    house: "House Pettersen Riis · Krøniken",
    title: "Vinterens Vakt",
    caption: "Snøen faller i tunge kapper, Hytta står som en festning bak grantrærnes hvite ringbrynjer.",
    span: "wide",
  },
  {
    src: g0314,
    house: "Frue av Huset",
    title: "Skjoldmøyen og Ulven",
    caption: "Med spade som sverd og en lojal ulv ved sin side — ingen snøstorm våger å utfordre henne.",
    span: "tall",
  },
  {
    src: g1801,
    house: "Husherren",
    title: "Vinterens Vokter",
    caption: "Spaden løftet, smilet trygt. Stien til hytta skal alltid være farbar.",
    span: "tall",
  },
  {
    src: g1951,
    house: "Maesterens Notat",
    title: "Snøens Tribunal",
    caption: "Tre meter hvit dom — vinteren har avsagt sin kjennelse over inngangspartiet.",
  },
  {
    src: g1821,
    house: "Husets Stridshest",
    title: "Den Svarte Ganger",
    caption: "Ford Ranger Wildtrak — uthvilt mellom snødekte trær, klar for neste ferd opp til borgen.",
    span: "wide",
  },
  {
    src: g0342,
    house: "Nattens Vandring",
    title: "Lyset i Mørket",
    caption: "Hodelykt mot uendelig svart. Gangeren venter i skyggen, motoren varm, hjemveien klar.",
  },
  {
    src: g0853,
    house: "Den Store Hall",
    title: "Once Upon a Time",
    caption: "Ugleøyne våker over salen. Geviret kroner peisen, og «Once upon a time» er skrevet i veggen.",
    span: "wide",
  },
  {
    src: g0851,
    house: "Husets Kjøkken",
    title: "Kokkens Kammer",
    caption: "Hvor festmåltidene fødes — kraft, kaffe og varme retter for kalde sjeler.",
  },
  {
    src: g1802,
    house: "Trollens Tilflukt",
    title: "Forbrenningstronen",
    caption: "Liten, mørk, kledd i snø — uthuset står fast som et lite tårn i den hvite stormen.",
    span: "tall",
  },
  {
    src: g1776,
    house: "Skogens Ild",
    title: "Granene som Brenner",
    caption: "Lyset fra hytta farger grantrærne i gull. En stille natt der stjernene holder vakt.",
    span: "tall",
  },
];

export const Route = createFileRoute("/hytta")({
  head: () => ({
    meta: [
      { title: "Hytta — House Pettersen Riis' tilflukt" },
      { name: "description", content: "Husets hytte — fjellets ro, peiskos og lange skiturer." },
      { property: "og:title", content: "Hytta | House Pettersen Riis" },
      { property: "og:description", content: "Vinterens favorittsted i fjellet." },
      { property: "og:image", content: hyttaImg },
    ],
  }),
  component: HyttaPage,
});

function HyttaPage() {
  return (
    <PageShell>
      <HyttaHero
        eyebrow="Husets tilflukt"
        title="Hytta"
        subtitle="Bortenfor fjordene venter peisens varme"
        image={hyttaImg}
      />

      <HyttaChecklist />

      <section className="container mx-auto px-4 py-12 space-y-5">
        <div className="ornate-divider mb-2">
          <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">Krøniken om hytta</span>
        </div>
        <p className="text-foreground/90 leading-relaxed">
          Når vintervindene feier over Skien, søker House Pettersen Riis tilflukt i tømmerhytta. Røyken stiger fra
          pipa, peisen knitrer, og ravnene holder vakt i grantrærne utenfor.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          Her samles familien til turer, brettspill, og lange måltider. Hytta er hjertet av husets ro — et sted hvor
          tiden går saktere og hvor stjernene står klarere.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4">
          <Stat label="Hovedhall — sengeplasser" value="4" />
          <Stat label="Annekset — sengeplasser" value="4" />
          <Stat label="Høyde over havet" value="598 moh" />
          <Stat label="Ildsted" value="1" />
          <Stat label="Forbrenningsdoer" value="2" />
          <Stat label="Boblebad" value="1" />
        </div>
      </section>

      <section className="container mx-auto px-4 pb-6">
        <HyttaIndreSal stationMatch="hytta" />
      </section>

      <NetatmoWeatherStationSection title="Værstasjonen — Hytta" stationMatch="hytta" />


      <HeatersPanel
        location="hytta"
        title="Varmemestrene · Hytta"
        emptyHint="Ingen varmeovner med termostat funnet for hytta i Homey."
      />

      {/* Galleriet — Krøniken om House Pettersen Riis i fjellet */}
      <section className="container mx-auto px-4 pb-16">
        <div className="ornate-divider mb-6">
          <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">Krøniken i bilder</span>
        </div>

        <header className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-3xl md:text-4xl heading-hero mb-3">Galleria Hyemalis</h2>
          <p className="text-muted-foreground italic">
            "Vinteren kommer alltid. Og hver vinter skriver House Pettersen Riis et nytt kapittel i snøen."
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 auto-rows-[260px] gap-4">
          {GALLERY.map((p, i) => (
            <GalleryCard key={i} plate={p} />
          ))}
        </div>

        <p className="text-center text-xs uppercase tracking-[0.4em] text-muted-foreground/70 mt-10">
          ❦ &nbsp; Sigillum Domus Riis &nbsp; ❦
        </p>
      </section>
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel rounded p-4 text-center">
      <div className="text-2xl text-primary text-medieval">{value}</div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function GalleryCard({ plate }: { plate: Plate }) {
  const spanClass =
    plate.span === "wide" ? "sm:col-span-2 sm:row-span-1" : plate.span === "tall" ? "sm:row-span-2" : "";

  return (
    <figure className={`panel relative overflow-hidden rounded-lg group glow-on-hover ${spanClass}`}>
      <img
        src={plate.src}
        alt={plate.title}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
      />

      {/* Gold corner ornaments */}
      <span className="pointer-events-none absolute top-2 left-2 h-4 w-4 border-t border-l border-primary/70" />
      <span className="pointer-events-none absolute top-2 right-2 h-4 w-4 border-t border-r border-primary/70" />
      <span className="pointer-events-none absolute bottom-2 left-2 h-4 w-4 border-b border-l border-primary/70" />
      <span className="pointer-events-none absolute bottom-2 right-2 h-4 w-4 border-b border-r border-primary/70" />

      {/* Atmospheric vignette + bottom darken for legibility */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, oklch(0.10 0.01 240 / 0.15) 0%, oklch(0.10 0.01 240 / 0.25) 45%, oklch(0.08 0.01 240 / 0.92) 100%)",
        }}
      />

      <figcaption className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
        <div className="text-[10px] tracking-[0.3em] uppercase text-primary/90 mb-1">{plate.house}</div>
        <h3 className="text-medieval text-xl sm:text-2xl text-foreground leading-tight mb-1.5">{plate.title}</h3>
        <p className="text-xs sm:text-sm text-muted-foreground/95 leading-snug max-h-0 overflow-hidden opacity-0 group-hover:max-h-32 group-hover:opacity-100 transition-all duration-500">
          {plate.caption}
        </p>
      </figcaption>
    </figure>
  );
}
