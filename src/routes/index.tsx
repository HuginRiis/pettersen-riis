import { createFileRoute, Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { HouseHero } from "@/components/HouseHero";
import { WeatherWidget } from "@/components/WeatherWidget";
import { TollnesCameraSection } from "@/components/TollnesCameraStrip";
import { NetatmoWeatherStationSection } from "@/components/NetatmoWeatherStation";
import { MaesterCounsel } from "@/components/MaesterCounsel";
import { BirthdayBanner } from "@/components/BirthdayBanner";
import { UpcomingHolidays } from "@/components/UpcomingHolidays";
import { Torch } from "@/components/Torch";
import { useFavorites } from "@/hooks/use-favorites";
import arnePortrait from "@/assets/arne-portrait.jpg";
import rebekkaPortrait from "@/assets/rebekka-portrait.jpg";
import celinePortrait from "@/assets/celine-portrait.jpg";
import maritaPortrait from "@/assets/marita-portrait.jpg";
import noraPortrait from "@/assets/nora-portrait.jpg";
import miraPortrait from "@/assets/mira-portrait.jpg";
import heroImg from "@/assets/hero-westeros.jpg";
import borgenSeasons from "@/assets/borgen-seasons.png";

// Current season based on month (Northern Hemisphere)
function getCurrentSeason(): "spring" | "summer" | "autumn" | "winter" {
  const m = new Date().getMonth(); // 0=Jan
  if (m >= 2 && m <= 4) return "spring";
  if (m >= 5 && m <= 7) return "summer";
  if (m >= 8 && m <= 10) return "autumn";
  return "winter";
}

const SEASON_META: Record<
  "spring" | "summer" | "autumn" | "winter",
  { label: string; words: string }
> = {
  spring: { label: "Vår", words: "Når blomstene våkner ved borgens mur" },
  summer: { label: "Sommer", words: "Når solen aldri synker over Skien" },
  autumn: { label: "Høst", words: "Når løvet faller som gull i tunet" },
  winter: { label: "Vinter", words: "Når snøen kler borgen i hvitt" },
};

// Coordinates
const HYTTA = { lat: 59.8733, lon: 9.4297 }; // Øvre Bjørkesetvegen 123, Flesberg
const TOLLNES = { lat: 59.1789, lon: 9.5732 }; // Tollnes, Skien

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "House Pettersen-Riis — Arne & Rebekka av Skien" },
      {
        name: "description",
        content:
          "Den offisielle krøniken om House Pettersen-Riis: Arne Pettersen Riis og Rebekka Riis Pettersen i Skien. Agenda, vær, pollen, hytta, hundene og trening.",
      },
      { property: "og:title", content: "House Pettersen-Riis — Arne & Rebekka av Skien" },
      {
        property: "og:description",
        content: "Familiens digitale storsal — i Game of Thrones-ånd.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <PageShell>
      <HouseHero
        eyebrow="Krøniken om"
        title="House Pettersen-Riis av Skien"
        subtitle="Arne Pettersen Riis og Rebekka Riis Pettersen — vinterens voktere ved fjorden."
        image={heroImg}
      />

      <BirthdayBanner />

      <section className="container mx-auto px-4 py-16">
        <div className="ornate-divider mb-10">
          <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
            Husets herskere
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:gap-6 max-w-2xl mx-auto">
          <div className="flex flex-col">
            <PortraitCard
              name="Arne Pettersen Riis"
              title="Lord av Skien"
              words="Med ære og ravner"
              image={arnePortrait}
            />
            <div className="mt-4">
              <div className="text-[9px] tracking-[0.3em] text-primary/80 uppercase text-center mb-2">
                Husets datter
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div />
                <MiniPortrait
                  name="Celine"
                  title="Den røde flamme"
                  words="Ild av Skien"
                  image={celinePortrait}
                />
                <div />
              </div>
            </div>
          </div>
          <div className="flex flex-col">
            <PortraitCard
              name="Rebekka Riis Pettersen"
              title="Lady av Skien"
              words="Sterk som vinterstormen"
              image={rebekkaPortrait}
            />
            <div className="mt-4">
              <div className="text-[9px] tracking-[0.3em] text-primary/80 uppercase text-center mb-2">
                Husets døtre
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <MiniPortrait
                  name="Marita"
                  title="Den andre"
                  words="Ætt av sommerlys"
                  image={maritaPortrait}
                />
                <MiniPortrait
                  name="Nora"
                  title="Den første"
                  words="Stille som måneskinn"
                  image={noraPortrait}
                />
                <MiniPortrait
                  name="Mira"
                  title="Avkommet til Nora"
                  words="Liten løve"
                  image={miraPortrait}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <SeasonsOfBorgen />

      <UpcomingHolidays />

      <MaesterCounsel />

      <section className="container mx-auto px-4 pb-16">
        <div className="ornate-divider mb-8">
          <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
            Værens ravner
          </span>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <WeatherWidget
            title="Hytta · Kommende helg"
            subtitle="Øvre Bjørkesetvegen 123, Flesberg"
            lat={HYTTA.lat}
            lon={HYTTA.lon}
            mode="weekend"
          />
          <WeatherWidget
            title="Tollnes · I morgen"
            subtitle="Tollnes, Skien"
            lat={TOLLNES.lat}
            lon={TOLLNES.lon}
            mode="tomorrow"
          />
        </div>
      </section>

      <section className="container mx-auto px-4 pb-20">
        <div className="ornate-divider mb-10">
          <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
            Husets saler
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
          <HallCard to="/agenda" title="Krøniken" desc="Agenda og meldinger med dato og emne." icon="📜" />
          <HallCard to="/var" title="Værens budskap" desc="Værmelding for Skien og hytta." icon="🌨" />
          <HallCard to="/pollen" title="Pollen" desc="Dagens pollen i lufta." icon="🌾" />
          <HallCard to="/varsler" title="Farevarsler" desc="Aktive farevarsler og trafikkmeldinger." icon="⚠️" />
          <HallCard to="/vakttarnet" title="Vakttårnet" desc="Vaktene rapporterer hvem som nærmer seg porten." icon="👁" />
          <HallCard to="/hytta" title="Hytta" desc="Husets tilflukt i fjellet." icon="🏔" />
          <HallCard to="/hundene" title="Hundene" desc="Husets tro følgesvenner." icon="🐺" />
          <HallCard to="/trening" title="Treningssalen" desc="Kroppen som rustning." icon="⚔️" />
          <HallCard to="/turer" title="Ferden" desc="Tips til turer i nærheten." icon="🧭" />
          <HallCard to="/jernhesten" title="Jernhesten" desc="Husets lydløse ganger — Jaguar I-Pace." icon="⚡" />
          <HallCard to="/smarthus" title="Smartborg" desc="Lys, varme og varslere fra Homey." icon="🏰" />
          <HallCard to="/brodering" title="Brodering" desc="Lag PES-filer for Brother — tekst og bilder." icon="🧵" />
          <HallCard to="/steintavle" title="Steintavle" desc="Husets innskrifter og notater." icon="🪨" />
          <HallCard to="/ranger" title="Ranger" desc="Husets robuste følgesvenn på veiene." icon="🛡" />
          <HallCard to="/oppussing-borgen" title="Prosjekter på Borgen" desc="Prosjekter, planer og bilder fra borgen." icon="🔨" />
          <HallCard to="/oppussing-hytta" title="Prosjekter på hytta" desc="Prosjekter, planer og bilder fra hytta." icon="🪵" />
        </div>
      </section>

      <NetatmoWeatherStationSection />

      <TollnesCameraSection />
    </PageShell>
  );
}

function SeasonsOfBorgen() {
  const season = getCurrentSeason();
  const meta = SEASON_META[season];
  // Quadrant order in source image: TL=spring, TR=summer, BL=autumn, BR=winter
  // object-position percentages for a 2x2 grid: 0% = left/top, 100% = right/bottom
  const POS: Record<"spring" | "summer" | "autumn" | "winter", string> = {
    spring: "0% 0%",
    summer: "100% 0%",
    autumn: "0% 100%",
    winter: "100% 100%",
  };
  return (
    <section className="container mx-auto px-4 pb-16">
      <div className="ornate-divider mb-8">
        <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
          Borgen nå · {meta.label}
        </span>
      </div>
      <article className="panel rounded-lg overflow-hidden max-w-3xl mx-auto">
        <div className="relative aspect-[3/2] overflow-hidden bg-background">
          <img
            src={borgenSeasons}
            alt={`Borgen i ${meta.label.toLowerCase()}`}
            className="absolute inset-0 w-full h-full"
            style={{
              objectFit: "cover",
              objectPosition: POS[season],
              // Source is 2x2 grid — scale 200% so one quadrant fills the frame
              transform: "scale(2)",
              transformOrigin: POS[season],
            }}
            loading="lazy"
          />
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded bg-primary text-primary-foreground text-[10px] tracking-[0.3em] uppercase">
            {meta.label}
          </div>
        </div>
        <div className="p-4 sm:p-5 text-center border-t border-border">
          <div className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase">
            Nå råder
          </div>
          <h3 className="text-lg sm:text-xl mt-1 text-primary">{meta.label} over borgen</h3>
          <p className="mt-1.5 text-medieval text-foreground/85 text-sm sm:text-base">
            "{meta.words}"
          </p>
        </div>
      </article>
    </section>
  );
}

function PortraitCard({
  name,
  title,
  words,
  image,
}: {
  name: string;
  title: string;
  words: string;
  image: string;
}) {
  return (
    <article className="panel rounded-lg overflow-hidden glow-on-hover">
      <div className="aspect-[4/5] overflow-hidden border-b border-border">
        <img
          src={image}
          alt={name}
          className="w-full h-full object-cover"
          loading="lazy"
          width={1024}
          height={1280}
        />
      </div>
      <div className="p-3 sm:p-4 text-center">
        <div className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
          {title}
        </div>
        <h3 className="text-base sm:text-lg mt-1 text-foreground">{name}</h3>
        <p className="mt-1.5 text-medieval text-primary text-sm sm:text-base">"{words}"</p>
      </div>
    </article>
  );
}

function MiniPortrait({
  name,
  title,
  words,
  image,
}: {
  name: string;
  title: string;
  words: string;
  image: string;
}) {
  return (
    <article className="panel rounded-md overflow-hidden glow-on-hover">
      <div className="aspect-square overflow-hidden border-b border-border">
        <img
          src={image}
          alt={name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="p-1.5 sm:p-2 text-center">
        <div className="text-[7px] sm:text-[8px] tracking-[0.2em] text-muted-foreground uppercase leading-tight">
          {title}
        </div>
        <h4 className="text-xs sm:text-sm mt-0.5 text-foreground leading-tight">{name}</h4>
        <p className="mt-0.5 text-medieval text-primary text-[10px] sm:text-xs leading-tight">"{words}"</p>
      </div>
    </article>
  );
}

function HallCard({
  to,
  title,
  desc,
  icon,
}: {
  to:
    | "/agenda"
    | "/var"
    | "/pollen"
    | "/vakttarnet"
    | "/varsler"
    | "/hytta"
    | "/hundene"
    | "/trening"
    | "/turer"
    | "/jernhesten"
    | "/ranger"
    | "/smarthus"
    | "/brodering"
    | "/steintavle"
    | "/oppussing-borgen"
    | "/oppussing-hytta";
  title: string;
  desc: string;
  icon: string;
}) {
  const disablePreload = to === "/smarthus" || to === "/var" || to === "/steintavle";
  const { isFavorite, toggleFavorite } = useFavorites();
  const fav = isFavorite(to);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void toggleFavorite(to, title, icon);
        }}
        className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-background/70 backdrop-blur border border-border hover:border-primary hover:bg-primary/10 transition-colors"
        aria-label={fav ? `Fjern ${title} fra favoritter` : `Legg ${title} til favoritter`}
        title={fav ? "Fjern fra favoritter" : "Legg til favoritter"}
      >
        <Star
          size={14}
          className={fav ? "fill-primary text-primary" : "text-muted-foreground"}
        />
      </button>
      <Link
        to={to}
        preload={disablePreload ? false : undefined}
        className="panel rounded-lg p-6 glow-on-hover block group"
      >
        <div className="text-3xl mb-3">{icon}</div>
        <h3 className="text-xl text-primary group-hover:text-gold transition-colors">
          {title}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
      </Link>
    </div>
  );
}
