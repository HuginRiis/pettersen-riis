import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";
import { HouseHero } from "@/components/HouseHero";
import { WeatherWidget } from "@/components/WeatherWidget";
import { TollnesCameraSection } from "@/components/TollnesCameraStrip";
import { NetatmoWeatherStationSection } from "@/components/NetatmoWeatherStation";
import { MaesterCounsel } from "@/components/MaesterCounsel";
import arnePortrait from "@/assets/arne-portrait.jpg";
import rebekkaPortrait from "@/assets/rebekka-portrait.jpg";
import celinePortrait from "@/assets/celine-portrait.jpg";
import maritaPortrait from "@/assets/marita-portrait.jpg";
import noraPortrait from "@/assets/nora-portrait.jpg";
import miraPortrait from "@/assets/mira-portrait.jpg";
import heroImg from "@/assets/hero-westeros.jpg";

// Coordinates
const HYTTA = { lat: 59.8733, lon: 9.4297 }; // Øvre Bjørkesetvegen 123, Flesberg
const TOLLNES = { lat: 59.1789, lon: 9.5732 }; // Tollnes, Skien

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "House Riis-Pettersen — Arne & Rebekka av Skien" },
      {
        name: "description",
        content:
          "Den offisielle krøniken om House Riis-Pettersen: Arne Pettersen Riis og Rebekka Riis Pettersen i Skien. Agenda, vær, pollen, hytta, hundene og trening.",
      },
      { property: "og:title", content: "House Riis-Pettersen — Arne & Rebekka av Skien" },
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
        title="House Riis-Pettersen av Skien"
        subtitle="Arne Pettersen Riis og Rebekka Riis Pettersen — vinterens voktere ved fjorden."
        image={heroImg}
      />

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
            Husets sale
          </span>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <HallCard to="/agenda" title="Krøniken" desc="Agenda og meldinger med dato og emne." icon="📜" />
          <HallCard to="/var" title="Værens budskap" desc="Værmelding og pollenvarsel for Skien." icon="🌨" />
          <HallCard to="/hytta" title="Hytta" desc="Husets tilflukt i fjellet." icon="🏔" />
          <HallCard to="/hundene" title="Hundene" desc="Husets tro følgesvenner." icon="🐺" />
          <HallCard to="/trening" title="Treningssalen" desc="Kroppen som rustning." icon="⚔️" />
          <HallCard to="/smarthus" title="Borgens Smarthus" desc="Lys, varme og varslere fra Homey." icon="🏰" />
          <HallCard to="/agenda" title="Send melding" desc="Skriv en kort hilsen til kalenderen." icon="🪶" />
        </div>
      </section>

      <NetatmoWeatherStationSection />

      <TollnesCameraSection />
    </PageShell>
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
  to: "/agenda" | "/var" | "/hytta" | "/hundene" | "/trening" | "/smarthus";
  title: string;
  desc: string;
  icon: string;
}) {
  return (
    <Link
      to={to}
      className="panel rounded-lg p-6 glow-on-hover block group"
    >
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-xl text-primary group-hover:text-gold transition-colors">
        {title}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
    </Link>
  );
}
