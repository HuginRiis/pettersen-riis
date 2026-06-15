import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { openLoginDialog } from "@/components/LoginDialog";
import { KeyRound, LogIn, Clock, MapPin, User, Bell, BellOff } from "lucide-react";
import { getPushPublicKey } from "@/lib/agenda-push";
import {
  type Who,
  getStoredWho,
  isPushSupported,
  isCurrentlySubscribed,
  subscribePush,
  unsubscribePush,
  updateSubscriptionWho,
} from "@/lib/push-client";
import { getWelcomeInfo } from "@/lib/auth.functions";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PageShell } from "@/components/PageShell";
import { HouseHero } from "@/components/HouseHero";
import { WeatherWidget } from "@/components/WeatherWidget";
import { UvPanel } from "@/components/UvPanel";
import { OutdoorWeatherStrip } from "@/components/OutdoorWeatherStrip";
import { IndoorWeatherStrip } from "@/components/IndoorWeatherStrip";
import { MaesterCounsel } from "@/components/MaesterCounsel";
import { BirthdayBanner } from "@/components/BirthdayBanner";
import { BirthdaysOverview } from "@/components/BirthdaysOverview";
import { UpcomingHolidays } from "@/components/UpcomingHolidays";
import { PushTodayBadge, LightsOnBadge, TomorrowWeatherBadge, MowerStatusBadge, GardenaStatusBadge, GardenaBatteryBadge, GardenaSignalBadge, RoborockStatusBadge, AlarmStateBadge, UtgangsdorenLockBadge, AlertsSeverityBadge, PowerVsYesterdayBadge, StepsTodayBadge, TrainingLast4WeeksBadge, GarbageNextPickupBadge, CurrentTempBadge, WeatherDaysBadge } from "@/components/HallBadges";
import { useMenuVisibility, isMenuLinkVisible } from "@/hooks/use-menu-visibility";
import { useCurrentWho } from "@/hooks/use-current-who";

import { SmartSearch } from "@/components/SmartSearch";

import { useAuthStatus } from "@/hooks/use-auth-status";
import { logoutFn } from "@/lib/auth.functions";
import arnePortrait from "@/assets/arne-portrait.jpg";
import rebekkaPortrait from "@/assets/rebekka-portrait.jpg";
import celinePortrait from "@/assets/celine-portrait.jpg";
import maritaPortrait from "@/assets/marita-portrait.jpg";
import noraPortrait from "@/assets/nora-portrait.jpg";
import miraPortrait from "@/assets/mira-portrait.jpg";
import heroImg from "@/assets/hero-westeros.webp";
import borgenSeasons from "@/assets/borgen-seasons.png";
// Hall background images (hentet fra hver sals egen hero)
import hallVar from "@/assets/got-var.jpg";
import hallPollen from "@/assets/got-pollen.jpg";
import hallTurer from "@/assets/got-turer.jpg";
import hallAgenda from "@/assets/got-agenda.jpg";
import hallVarsler from "@/assets/got-varsler.jpg";
import hallVakttarnet from "@/assets/got-vakttarnet.jpg";
import hallHytta from "@/assets/hytta-aurora-got.webp";
import hallTrening from "@/assets/got-trening.jpg";


import hallSmarthus from "@/assets/got-smarthus.jpg";
import hallStrom from "@/assets/stromkroniken.jpg";
import hallSteintavle from "@/assets/got-brodering.jpg";
import hallVarslinger from "@/assets/got-varslinger.jpg";
import hallKvitteringer from "@/assets/got-kvitteringer.jpg";
import hallOkonomi from "@/assets/got-okonomi.jpg";
import hallLys from "@/assets/got-lys.jpg";
import hallVarme from "@/assets/got-varme.jpg";
import hallGressklipper from "@/assets/got-gressklipper.jpg";
import hallStovsuger from "@/assets/got-stovsuger.jpg";
import hallSkatt from "@/assets/got-skatt.jpg";
import hallHest from "@/assets/jernhesten.jpg";

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
  const menuVisibility = useMenuVisibility();
  const who = useCurrentWho();
  const showHall = (to: string) => isMenuLinkVisible(menuVisibility, to, who);


  // Tidligere kiosk-minne sendte enheten automatisk til Steintavlen.
  // Det er nå deaktivert — Hjem skal alltid være startsiden. Rydder opp gammel verdi.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem("pr.kiosk.lastRoute");
    } catch {}
  }, []);

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
      <div className="relative">
        <HouseHero
          eyebrow="Krøniken om"
          title="House Pettersen-Riis av Skien"
          subtitle="Arne Pettersen Riis og Rebekka Riis Pettersen — vinterens voktere ved fjorden."
          image={heroImg}
        />
        <HeroAuthPill authenticated={isAuthed} onLogout={handleLogout} />
      </div>

      <div className="container mx-auto px-4 -mt-4 sm:-mt-6 mb-6 flex justify-center relative z-10">
        <button
          type="button"
          onClick={() => {
            const el = document.getElementById("husets-saler");
            if (el) {
              const y = el.getBoundingClientRect().top + window.scrollY - 8;
              window.scrollTo({ top: y, behavior: "smooth" });
            }
          }}
          className="relative text-display tracking-[0.35em] text-sm sm:text-base uppercase px-6 sm:px-8 py-3 border-2 border-primary/70 bg-background/80 backdrop-blur text-primary hover:bg-primary hover:text-primary-foreground transition-colors shadow-[0_0_18px_hsl(var(--primary)/0.55)] animate-pulse hover:animate-none"
        >
          <span className="pointer-events-none absolute inset-0 -z-10 border-2 border-primary/60 animate-ping" />
          ⚔ Menyen ⚔
        </button>
      </div>

      <SmartSearch />

      <OutdoorWeatherStrip stationMatch="tollnes" />
      <IndoorWeatherStrip stationMatch="tollnes" label="Inne nå · Tollnes" />

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

        <WeddingAnniversary />
      </section>

      <SeasonsOfBorgen />

      <UpcomingHolidays />

      <BirthdaysOverview />

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

        <div className="grid md:grid-cols-2 gap-5 mt-5">
          <UvPanel
            title="Solens kraft · Borgen"
            subtitle="UV-indeks og soltider · Tollnes, Skien"
            lat={TOLLNES.lat}
            lon={TOLLNES.lon}
          />
          <UvPanel
            title="Solens kraft · Hytta"
            subtitle="UV-indeks og soltider · Flesberg"
            lat={HYTTA.lat}
            lon={HYTTA.lon}
          />
        </div>
      </section>

      <section id="husets-saler" className="container mx-auto px-4 pb-20 scroll-mt-4">
        <div className="ornate-divider mb-10">
          <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
            Husets saler
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
          {showHall("/var") && <HallCard to="/var" title="Værens budskap" desc="Værmelding for Skien og hytta." icon="🌨" image={hallVar} locked={false} badge={<HallBadgeStack><WeatherDaysBadge inline lat={TOLLNES.lat} lon={TOLLNES.lon} /><CurrentTempBadge inline lat={TOLLNES.lat} lon={TOLLNES.lon} /></HallBadgeStack>} />}
          {showHall("/pollen") && <HallCard to="/pollen" title="Pollen" desc="Dagens pollen i lufta." icon="🌾" image={hallPollen} locked={false} />}
          {showHall("/turer") && <HallCard to="/turer" title="Ferden" desc="Tips til turer i nærheten." icon="🧭" image={hallTurer} locked={false} />}
          {showHall("/agenda") && <HallCard to="/agenda" title="Søppel, bursdager og meldinger" desc="Søppeltømming, bursdager og meldinger med dato og emne." icon="📜" image={hallAgenda} locked={!isAuthed} badge={<HallBadgeStack><GarbageNextPickupBadge inline /></HallBadgeStack>} />}
          {showHall("/varsler") && <HallCard to="/varsler" title="Farevarsler" desc="Aktive farevarsler og trafikkmeldinger." icon="⚠️" image={hallVarsler} locked={false} badge={<HallBadgeStack><AlertsSeverityBadge inline /></HallBadgeStack>} />}
          {showHall("/vakttarnet") && <HallCard to="/vakttarnet" title="Vakttårnet" desc="Vaktene rapporterer hvem som nærmer seg porten." icon="👁" image={hallVakttarnet} locked={!isAuthed} badge={<HallBadgeStack><AlarmStateBadge inline /><UtgangsdorenLockBadge inline /></HallBadgeStack>} />}
          {showHall("/hytta") && <HallCard to="/hytta" title="Hytta" desc="Husets tilflukt i fjellet." icon="🏔" image={hallHytta} locked={false} />}
          {showHall("/trening") && <HallCard to="/trening" title="Treningssalen" desc="Kroppen som rustning." icon="⚔️" image={hallTrening} locked={!isAuthed} badge={<HallBadgeStack><StepsTodayBadge inline owner="arne" /><StepsTodayBadge inline owner="rebekka" /><TrainingLast4WeeksBadge inline owner="arne" /><TrainingLast4WeeksBadge inline owner="rebekka" /></HallBadgeStack>} />}



          {showHall("/smarthus") && <HallCard to="/smarthus" title="Smarthus" desc="Lys, varme og varslere fra Homey." icon="🏰" image={hallSmarthus} locked={!isAuthed} badge={<HallBadgeStack><MowerStatusBadge inline /></HallBadgeStack>} />}
          {showHall("/lys") && <HallCard to="/lys" title="Lys" desc="Husets ild — tente lys og scener." icon="💡" image={hallLys} locked={!isAuthed} badge={<HallBadgeStack><LightsOnBadge inline /></HallBadgeStack>} />}
          {showHall("/varme") && <HallCard to="/varme" title="Varme & Klima" desc="Ovner, varmepumper og luftretning — borgen og hytta." icon="🔥" image={hallVarme} locked={!isAuthed} />}
          {showHall("/gressklipper") && <HallCard to="/gressklipper" title="Gressklipper" desc="Sileno-vokteren av plenen." icon="🌱" image={hallGressklipper} locked={!isAuthed} badge={<HallBadgeStack><GardenaStatusBadge inline /><GardenaBatteryBadge inline /><GardenaSignalBadge inline /></HallBadgeStack>} />}
          {showHall("/stovsugeren") && <HallCard to="/stovsugeren" title="Støvsugeren" desc="Roborock — Hjemme og Hytta." icon="🤖" image={hallStovsuger} locked={!isAuthed} badge={<HallBadgeStack><RoborockStatusBadge inline match="hjem" name="Hjemme" /><RoborockStatusBadge inline match="hytt" name="Hytta" /></HallBadgeStack>} />}
          {showHall("/stromkroniken") && <HallCard to="/stromkroniken" title="Strømkrøniken" desc="Husets strømgull — kostnader, forbruk og priser." icon="⚡" image={hallStrom} locked={!isAuthed} badge={<HallBadgeStack><PowerVsYesterdayBadge inline /></HallBadgeStack>} />}
          {showHall("/skatte-utregningen") && <HallCard to="/skatte-utregningen" title="Skatte­utregningen" desc="Skatt og lønn — beregninger." icon="🪙" image={hallSkatt} locked={!isAuthed} />}
          {showHall("/steintavle") && <HallCard to="/steintavle" title="Steintavle" desc="Husets innskrifter og notater." icon="🪨" image={hallSteintavle} locked={!isAuthed} />}
          {showHall("/steintavle-2") && <HallCard to="/steintavle-2" title="Steintavle 2" desc="Stor visning — temperatur, regn og vind på borgen." icon="🪨" image={hallSteintavle} locked={!isAuthed} />}
          {showHall("/hest-og-kjerre-tur") && <HallCard to="/hest-og-kjerre-tur" title="Hest og kjerre tur" desc="Statistikk og målinger fra turer med jernhesten." icon="🐎" image={hallHest} locked={!isAuthed} />}
          {showHall("/kvitteringer") && <HallCard to="/kvitteringer" title="Kvitteringer" desc="Husets kvitteringer, garanti og utgifter." icon="🧾" image={hallKvitteringer} locked={!isAuthed} />}
          {showHall("/okonomi") && <HallCard to="/okonomi" title="Husholdningens hvelv" desc="Budsjett og forbruk — Iron Bank of Braavos." icon="🏦" image={hallOkonomi} locked={!isAuthed} />}
          {showHall("/push-varslinger") && <HallCard to="/push-varslinger" title="Innstillinger" desc="Push-varsler og innstillinger for husets ravner." icon="🔔" image={hallVarslinger} locked={!isAuthed} badge={<HallBadgeStack><PushTodayBadge inline /></HallBadgeStack>} />}
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

/* ─── Bryllupsdag ───────────────────────────────────────────────────── */

const WEDDING_DATE = new Date(Date.UTC(2018, 5, 2)); // 2. juni 2018

const ANNIVERSARY_NAMES: Record<number, string> = {
  1: "Papirbryllup",
  2: "Bomullsbryllup",
  3: "Lærbryllup",
  4: "Silkebryllup",
  5: "Trebryllup",
  6: "Sukkerbryllup",
  7: "Ullbryllup",
  8: "Bronsebryllup",
  9: "Keramikkbryllup",
  10: "Tinnbryllup",
  11: "Stålbryllup",
  12: "Silkebryllup",
  13: "Kniplingsbryllup",
  14: "Elfenbensbryllup",
  15: "Krystallbryllup",
  20: "Porselensbryllup",
  25: "Sølvbryllup",
  30: "Perlebryllup",
  35: "Korallbryllup",
  40: "Rubinbryllup",
  45: "Safirbryllup",
  50: "Gullbryllup",
  55: "Smaragdbryllup",
  60: "Diamantbryllup",
  65: "Jernbryllup",
  70: "Platinabryllup",
  75: "Kronediamantbryllup",
};

function getAnniversaryName(year: number): string {
  if (ANNIVERSARY_NAMES[year]) return ANNIVERSARY_NAMES[year];
  const known = Object.keys(ANNIVERSARY_NAMES).map(Number).sort((a, b) => a - b);
  let prev = 0;
  for (const k of known) {
    if (k <= year) prev = k;
    else break;
  }
  return prev > 0 ? `Etter ${ANNIVERSARY_NAMES[prev]}` : "—";
}

function WeddingAnniversary() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!now) return null;

  const fullYears = (() => {
    const y = now.getUTCFullYear() - WEDDING_DATE.getUTCFullYear();
    const beforeAnniversary =
      now.getUTCMonth() < WEDDING_DATE.getUTCMonth() ||
      (now.getUTCMonth() === WEDDING_DATE.getUTCMonth() &&
        now.getUTCDate() < WEDDING_DATE.getUTCDate());
    return beforeAnniversary ? y - 1 : y;
  })();

  const nextAnniv = new Date(Date.UTC(now.getUTCFullYear(), 5, 2));
  if (nextAnniv.getTime() < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) {
    nextAnniv.setUTCFullYear(now.getUTCFullYear() + 1);
  }
  const daysUntil = Math.round(
    (nextAnniv.getTime() -
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) /
      86_400_000,
  );
  const isToday = daysUntil === 0;
  const upcomingYears = fullYears + (isToday ? 0 : 1);
  const currentName = getAnniversaryName(fullYears);
  const upcomingName = getAnniversaryName(upcomingYears);

  return (
    <div className="mt-8 max-w-2xl mx-auto">
      <div className="panel rounded-lg p-5 text-center">
        <div className="text-[9px] tracking-[0.3em] text-primary/80 uppercase mb-2">
          Bryllupsdag
        </div>
        <div className="text-medieval text-primary text-lg md:text-xl">
          ❦ Forent 2. juni 2018 ❦
        </div>
        <p className="text-foreground/90 text-sm md:text-base mt-2 tabular-nums">
          {fullYears} år gift —{" "}
          <span className="text-primary font-semibold">{currentName}</span>
        </p>
        <p className="text-xs text-muted-foreground mt-1.5 tabular-nums">
          {isToday ? (
            <span className="text-primary font-semibold">I dag feires {upcomingName}!</span>
          ) : (
            <>
              {daysUntil} {daysUntil === 1 ? "dag" : "dager"} til {upcomingYears}-års dagen (
              {upcomingName})
            </>
          )}
        </p>
      </div>
    </div>
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
  image,
  locked = false,
  badge,
}: {
  to:
    | "/agenda"
    | "/var"
    | "/pollen"
    | "/vakttarnet"
    | "/varsler"
    | "/hytta"
    | "/trening"
    | "/turer"
    | "/stromkroniken"
    | "/smarthus"
    | "/lys"
    | "/varme"
    | "/gressklipper"
    | "/stovsugeren"
    | "/skatte-utregningen"
    | "/steintavle"
    | "/steintavle-2"
    | "/kvitteringer"
    | "/okonomi"
    | "/push-varslinger"
    | "/hest-og-kjerre-tur";

  title: string;
  desc: string;
  icon: string;
  image: string;
  locked?: boolean;
  badge?: React.ReactNode;
}) {
  const disablePreload = to === "/smarthus" || to === "/var" || to === "/steintavle";

  // Shared background layer (image + dark overlay so text remains readable)
  const bgLayer = (
    <>
      <img
        src={image}
        alt=""
        aria-hidden
        loading="lazy"
        className={`absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${locked ? "opacity-30 grayscale" : "opacity-55 group-hover:opacity-70"}`}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, oklch(0.10 0.01 240 / 0.55) 0%, oklch(0.10 0.01 240 / 0.85) 100%)",
        }}
      />
    </>
  );

  if (locked) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => openLoginDialog()}
          className="panel rounded-lg p-6 block group opacity-80 hover:opacity-100 transition-opacity relative overflow-hidden text-left w-full min-h-[160px]"
          title={`${title} — krever passord`}
        >
          {bgLayer}
          <div className="absolute top-2 right-2 p-1.5 rounded-full bg-background/70 backdrop-blur border border-border z-10">
            <KeyRound size={12} className="text-primary/80" />
          </div>
          {badge && <div className="absolute top-2 left-2 z-10">{badge}</div>}
          <div className="relative z-[1]">
            <div className="text-3xl mb-3">{icon}</div>
            <h3 className="text-xl text-foreground group-hover:text-primary transition-colors drop-shadow">
              {title}
            </h3>
            <p className="mt-2 text-sm text-foreground/80">{desc}</p>
            <p className="mt-2 text-[10px] tracking-[0.25em] uppercase text-primary/90">
              Bak portalen
            </p>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Link
        to={to}
        preload={disablePreload ? false : undefined}
        className="panel rounded-lg p-6 glow-on-hover block group relative overflow-hidden min-h-[160px]"
      >
        {bgLayer}
        {badge}
        <div className="relative z-[1]">
          <div className="text-3xl mb-3">{icon}</div>
          <h3 className="text-xl text-primary group-hover:text-gold transition-colors drop-shadow">
            {title}
          </h3>
          <p className="mt-2 text-sm text-foreground/85">{desc}</p>
        </div>
      </Link>
    </div>
  );
}

function HallBadgeStack({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute top-2 right-2 z-10 flex flex-wrap justify-end gap-1 max-w-[80%]">
      {children}
    </div>
  );
}

type WelcomeInfo = {
  authenticated: boolean;
  who: string | null;
  ip: string | null;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
};

function formatNo(dt: string | null): string {
  if (!dt) return "—";
  try {
    const d = new Date(dt);
    return d.toLocaleString("nb-NO", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dt;
  }
}

function WelcomeInfoStrip({ info }: { info: WelcomeInfo | null }) {
  if (!info) return null;
  const name = info.who && info.who !== "Alle" ? info.who : info.ip ? `gjest (${info.ip})` : null;
  return (
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
      {info.ip && !name && (
        <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 sm:col-span-3">
          <MapPin className="w-3.5 h-3.5 mt-0.5 text-primary/70 shrink-0" />
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground/80">Din adresse</div>
            <div className="text-foreground truncate">{info.ip}</div>
          </div>
        </div>
      )}
    </div>
  );
}

const DEVICE_WHO_OPTIONS: Who[] = ["Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"];

function HeroAuthPill({
  authenticated,
  onLogout,
}: {
  authenticated: boolean;
  onLogout: () => void;
}) {
  const fetchPushPublicKey = useServerFn(getPushPublicKey);
  const [info, setInfo] = useState<WelcomeInfo | null>(null);
  const [pushSupported, setPushSupported] = useState<boolean>(true);
  const [pushSubscribed, setPushSubscribed] = useState<boolean>(false);
  const [pushWho, setPushWho] = useState<Who>("Alle");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [editingWho, setEditingWho] = useState(false);

  useEffect(() => {
    setPushSupported(isPushSupported());
    setPushWho(getStoredWho());
    isCurrentlySubscribed().then(setPushSubscribed);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let endpoint: string | null = null;
      let storedWho: string | null = null;
      try {
        const { getCurrentSubscriptionDetails, getStoredWho: gw } = await import("@/lib/push-client");
        const sub = await getCurrentSubscriptionDetails();
        if (sub) endpoint = sub.endpoint;
        storedWho = gw();
      } catch {
        /* ignore */
      }
      try {
        const d = await getWelcomeInfo({ data: { endpoint, storedWho } });
        if (!cancelled) setInfo(d as WelcomeInfo);
      } catch {
        if (!cancelled) setInfo(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  async function togglePush() {
    if (pushSubscribed) {
      const ok = typeof window !== "undefined"
        ? window.confirm("Er du sikker på at du vil slå av Ravnenes bud?")
        : true;
      if (!ok) return;
    }
    setPushBusy(true);
    setPushMsg(null);
    if (pushSubscribed) {
      const r = await unsubscribePush();
      if (r.ok) {
        setPushSubscribed(false);
        setPushMsg("Ravnene er kalt hjem.");
      } else setPushMsg(r.error || "Kunne ikke slå av.");
    } else {
      const { vapidPublicKey } = await fetchPushPublicKey();
      const r = await subscribePush(pushWho, vapidPublicKey);
      if (r.ok) {
        setPushSubscribed(true);
        setPushMsg(`Ravnene flyr nå til "${pushWho}".`);
      } else setPushMsg(r.error || "Kunne ikke slå på.");
    }
    setPushBusy(false);
  }

  async function changePushWho(next: Who) {
    if (next === pushWho) return;
    // Bekreft kun når vi bytter fra én ekte bruker til en annen
    // (ikke fra "Alle"/gjest til en bruker).
    const isRealUser = (w: Who) => w !== "Alle";
    if (isRealUser(pushWho) && isRealUser(next)) {
      const ok = typeof window !== "undefined"
        ? window.confirm(`Vil du bytte bruker fra "${pushWho}" til "${next}"?`)
        : true;
      if (!ok) {
        setEditingWho(false);
        return;
      }
    }
    setPushWho(next);
    setEditingWho(false);
    if (pushSubscribed) {
      setPushBusy(true);
      const r = await updateSubscriptionWho(next);
      setPushBusy(false);
      setPushMsg(r.ok ? `Denne enheten er nå satt som "${next}".` : r.error || "Feil");
    }
  }

  const greetingName = info?.who && info.who !== "Alle" ? info.who : null;

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none w-[min(92vw,440px)]">
      <div className="pointer-events-auto rounded-2xl border border-primary/40 bg-background/75 backdrop-blur-md px-3 py-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.45)] flex flex-col gap-2">
        {/* Welcome row */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full border border-primary/50 flex items-center justify-center text-primary text-sm shrink-0">
            ❦
          </div>
          <div className="flex flex-col leading-tight flex-1 min-w-0">
            <span className="text-[8px] tracking-[0.25em] uppercase text-primary/80">
              {authenticated ? "Borgen er åpen" : "Husets port"}
            </span>
            <span className="text-[11px] text-foreground truncate">
              {greetingName ? `Velkommen ${greetingName}` : "Velkommen Gjest"}
            </span>
          </div>
          {authenticated ? (
            <button
              onClick={onLogout}
              type="button"
              title="Logg ut"
              className="inline-flex items-center gap-1 text-[10px] tracking-[0.2em] uppercase text-muted-foreground hover:text-primary transition-colors px-2.5 py-1.5 border border-border rounded-full hover:border-primary/60 shrink-0"
            >
              <KeyRound size={12} />
              <span className="hidden sm:inline">Logg ut</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openLoginDialog()}
              title="Logg inn"
              className="inline-flex items-center gap-1 text-[10px] tracking-[0.2em] uppercase text-primary hover:text-primary px-2.5 py-1.5 border border-primary/50 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors shrink-0"
            >
              <LogIn size={12} />
              <span className="hidden sm:inline">Logg inn</span>
            </button>
          )}
        </div>

        {/* Push row */}
        {pushSupported ? (
          <div className="flex items-center gap-2 border-t border-primary/20 pt-2">
            {pushSubscribed ? (
              <Bell size={14} className="text-primary shrink-0" />
            ) : (
              <BellOff size={14} className="text-muted-foreground shrink-0" />
            )}
            <div className="flex flex-col leading-tight flex-1 min-w-0">
              <span className="text-[8px] tracking-[0.25em] uppercase text-primary/80">
                Ravnenes bud
              </span>
              {editingWho ? (
                <select
                  autoFocus
                  value={pushWho}
                  onChange={(e) => changePushWho(e.target.value as Who)}
                  onBlur={() => setEditingWho(false)}
                  className="bg-input border border-border rounded px-1.5 py-0.5 text-[11px] text-foreground"
                >
                  {DEVICE_WHO_OPTIONS.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingWho(true)}
                  className="text-[11px] text-foreground text-left hover:text-primary transition-colors truncate inline-flex items-center gap-1"
                  title="Endre bruker"
                >
                  <User size={10} className="text-primary/70" />
                  {pushWho === "Alle" ? "Velg bruker" : pushWho}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={togglePush}
              disabled={pushBusy}
              className={`px-2.5 py-1 rounded-full text-[10px] tracking-[0.2em] uppercase font-medium border transition shrink-0 ${
                pushSubscribed
                  ? "border-border text-foreground hover:bg-accent/40"
                  : "bg-primary text-primary-foreground border-primary hover:opacity-90"
              } disabled:opacity-50`}
            >
              {pushBusy ? "..." : pushSubscribed ? "Slå av" : "Slå på"}
            </button>
          </div>
        ) : null}
        {pushMsg && (
          <p className="text-[10px] text-muted-foreground px-1 leading-tight">{pushMsg}</p>
        )}
      </div>
    </div>
  );
}

