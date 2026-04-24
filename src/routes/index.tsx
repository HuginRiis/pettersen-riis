import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { openLoginDialog } from "@/components/LoginDialog";
import { Star, KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PageShell } from "@/components/PageShell";
import { HouseHero } from "@/components/HouseHero";
import { WeatherWidget } from "@/components/WeatherWidget";
import { MaesterCounsel } from "@/components/MaesterCounsel";
import { BirthdayBanner } from "@/components/BirthdayBanner";
import { UpcomingHolidays } from "@/components/UpcomingHolidays";
import { GarbageCollectionPanel } from "@/components/GarbageCollectionPanel";
import { useFavorites } from "@/hooks/use-favorites";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { logoutFn } from "@/server/auth";
import arnePortrait from "@/assets/arne-portrait.jpg";
import rebekkaPortrait from "@/assets/rebekka-portrait.jpg";
import celinePortrait from "@/assets/celine-portrait.jpg";
import maritaPortrait from "@/assets/marita-portrait.jpg";
import noraPortrait from "@/assets/nora-portrait.jpg";
import miraPortrait from "@/assets/mira-portrait.jpg";
import heroImg from "@/assets/hero-westeros.jpg";
import borgenSeasons from "@/assets/borgen-seasons.png";

// Halls available to anyone who steps into the courtyard (no password required)
const PUBLIC_HALL_PATHS = new Set<string>(["/var", "/pollen", "/turer"]);

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
  const router = useRouter();
  const { authenticated } = useAuthStatus();
  const isAuthed = authenticated === true;

  // If the wanderer was sent here from a locked hall (root redirect adds ?login=1),
  // open the login dialog automatically so they can step through the gate.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("login") === "1" && !isAuthed) {
      openLoginDialog();
      params.delete("login");
      const qs = params.toString();
      const url = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
      window.history.replaceState({}, "", url);
    }
  }, [isAuthed]);

  const handleLogout = async () => {
    try {
      await logoutFn();
    } finally {
      await router.invalidate();
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    }
  };

  return (
    <PageShell>
      <HouseHero
        eyebrow="Krøniken om"
        title="House Pettersen-Riis av Skien"
        subtitle="Arne Pettersen Riis og Rebekka Riis Pettersen — vinterens voktere ved fjorden."
        image={heroImg}
      />

      <PortalGate authenticated={isAuthed} onLogout={handleLogout} />

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

      {isAuthed && <GarbageCollectionPanel />}

      <MaesterCounsel />

      <section className="container mx-auto px-4 pb-16">
        <div className="ornate-divider mb-8">
          <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
            Værens ravner
          </span>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <WeatherWidget
            title="Hytta · Helgen (fre–søn)"
            subtitle="Øvre Bjørkesetvegen 123, Flesberg"
            lat={HYTTA.lat}
            lon={HYTTA.lon}
            mode="weekend"
          />
          <WeatherWidget
            title="Tollnes · Neste 2 dager"
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
          <HallCard to="/var" title="Værens budskap" desc="Værmelding for Skien og hytta." icon="🌨" locked={false} />
          <HallCard to="/pollen" title="Pollen" desc="Dagens pollen i lufta." icon="🌾" locked={false} />
          <HallCard to="/turer" title="Ferden" desc="Tips til turer i nærheten." icon="🧭" locked={false} />
          <HallCard to="/agenda" title="Krøniken" desc="Agenda og meldinger med dato og emne." icon="📜" locked={!isAuthed} />
          <HallCard to="/varsler" title="Farevarsler" desc="Aktive farevarsler og trafikkmeldinger." icon="⚠️" locked={false} />
          <HallCard to="/vakttarnet" title="Vakttårnet" desc="Vaktene rapporterer hvem som nærmer seg porten." icon="👁" locked={!isAuthed} />
          <HallCard to="/hytta" title="Hytta" desc="Husets tilflukt i fjellet." icon="🏔" locked={false} />
          <HallCard to="/hundene" title="Hundene" desc="Husets tro følgesvenner." icon="🐺" locked={!isAuthed} />
          <HallCard to="/trening" title="Treningssalen" desc="Kroppen som rustning." icon="⚔️" locked={!isAuthed} />
          <HallCard to="/smarthus" title="Smartborg" desc="Lys, varme og varslere fra Homey." icon="🏰" locked={!isAuthed} />
          <HallCard to="/stromkroniken" title="Strømkrøniken" desc="Husets strømgull — kostnader, forbruk og priser." icon="⚡" locked={!isAuthed} />
          <HallCard to="/matvarer" title="Matvarekrøniken" desc="Søk og sammenlign priser i norske butikker." icon="🛒" locked={!isAuthed} />
          <HallCard to="/steintavle" title="Steintavle" desc="Husets innskrifter og notater." icon="🪨" locked={!isAuthed} />
          <HallCard to="/oppussing-borgen" title="Prosjekter på Borgen" desc="Prosjekter, planer og bilder fra borgen." icon="🔨" locked={!isAuthed} />
          <HallCard to="/oppussing-hytta" title="Prosjekter på hytta" desc="Prosjekter, planer og bilder fra hytta." icon="🪵" locked={!isAuthed} />
        </div>
      </section>
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
  const [open, setOpen] = useState(false);
  return (
    <>
      <article
        onClick={() => setOpen(true)}
        className="panel rounded-lg overflow-hidden glow-on-hover cursor-zoom-in transition-transform duration-300 hover:scale-[1.02]"
      >
        <div className="aspect-[4/5] overflow-hidden border-b border-border">
          <img
            src={image}
            alt={name}
            className="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
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
      <PortraitZoomDialog
        open={open}
        onOpenChange={setOpen}
        name={name}
        title={title}
        words={words}
        image={image}
      />
    </>
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
  const [open, setOpen] = useState(false);
  return (
    <>
      <article
        onClick={() => setOpen(true)}
        className="panel rounded-md overflow-hidden glow-on-hover cursor-zoom-in transition-transform duration-300 hover:scale-[1.05]"
      >
        <div className="aspect-square overflow-hidden border-b border-border">
          <img
            src={image}
            alt={name}
            className="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
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
      <PortraitZoomDialog
        open={open}
        onOpenChange={setOpen}
        name={name}
        title={title}
        words={words}
        image={image}
      />
    </>
  );
}

function PortraitZoomDialog({
  open,
  onOpenChange,
  name,
  title,
  words,
  image,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  name: string;
  title: string;
  words: string;
  image: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 border-primary/40 bg-background overflow-hidden">
        <DialogTitle className="sr-only">{name}</DialogTitle>
        <DialogDescription className="sr-only">{title} — {words}</DialogDescription>
        <div className="relative">
          <div className="aspect-[4/5] sm:aspect-[3/4] overflow-hidden bg-background">
            <img
              src={image}
              alt={name}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/85 to-transparent p-5 sm:p-7 text-center">
            <div className="text-[10px] sm:text-xs tracking-[0.3em] text-primary/90 uppercase">
              {title}
            </div>
            <h3 className="mt-1 text-xl sm:text-2xl text-foreground text-display">{name}</h3>
            <p className="mt-2 text-medieval text-primary text-base sm:text-lg">"{words}"</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HallCard({
  to,
  title,
  desc,
  icon,
  locked = false,
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
    | "/stromkroniken"
    | "/smarthus"
    | "/steintavle"
    | "/oppussing-borgen"
    | "/oppussing-hytta"
    | "/matvarer";
  title: string;
  desc: string;
  icon: string;
  locked?: boolean;
}) {
  const disablePreload = to === "/smarthus" || to === "/var" || to === "/steintavle";
  const { isFavorite, toggleFavorite } = useFavorites();
  const fav = isFavorite(to);

  if (locked) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => openLoginDialog()}
          className="panel rounded-lg p-6 block group opacity-60 hover:opacity-100 transition-opacity relative overflow-hidden text-left w-full"
          title={`${title} — krever passord`}
        >
          <div className="absolute top-2 right-2 p-1.5 rounded-full bg-background/70 backdrop-blur border border-border">
            <KeyRound size={12} className="text-primary/80" />
          </div>
          <div className="text-3xl mb-3 grayscale">{icon}</div>
          <h3 className="text-xl text-muted-foreground group-hover:text-primary transition-colors">
            {title}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground/70">{desc}</p>
          <p className="mt-2 text-[10px] tracking-[0.25em] uppercase text-primary/70">
            Bak portalen
          </p>
        </button>
      </div>
    );
  }

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

function PortalGate({
  authenticated,
  onLogout,
}: {
  authenticated: boolean;
  onLogout: () => void;
}) {
  if (authenticated) {
    return (
      <section className="container mx-auto px-4 pt-10">
        <div className="max-w-3xl mx-auto panel rounded-lg p-5 sm:p-6 flex items-center justify-between gap-4 border border-primary/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full border border-primary/40 flex items-center justify-center text-primary text-lg shrink-0">
              ❦
            </div>
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-primary/80">
                Borgen er åpne
              </div>
              <div className="text-sm sm:text-base text-foreground">
                Velkommen, herskere av huset.
              </div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="text-xs tracking-[0.25em] uppercase text-muted-foreground hover:text-primary transition-colors px-3 py-2 border border-border rounded-md hover:border-primary/60"
          >
            Steng porten
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="container mx-auto px-4 pt-10">
      <div className="max-w-3xl mx-auto panel rounded-lg p-6 sm:p-8 text-center border border-primary/30 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-30 bg-gradient-to-b from-primary/10 via-transparent to-primary/10" />
        <div className="relative">
          <div className="mx-auto w-14 h-14 rounded-full border border-primary/50 flex items-center justify-center text-primary text-2xl mb-4">
            ❦
          </div>
          <h2 className="text-display text-xl sm:text-2xl text-primary tracking-[0.2em] uppercase">
            Vandreren er velkommen
          </h2>
          <p className="mt-3 text-sm text-foreground/80 max-w-xl mx-auto">
            Værets ravner, pollenets bud og ferdens stier står åpne for alle.
            For å tre dypere inn i borgens saler — krønike, vakttårn, hytta og smartborgen — må du åpne portalen med husets nøkkel.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => openLoginDialog()}
              className="got-nav-btn"
            >
              <KeyRound size={14} className="inline mr-1.5 -mt-0.5" />
              Tre inn i borgen
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
