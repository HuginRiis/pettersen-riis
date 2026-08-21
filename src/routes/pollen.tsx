import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/PageShell";
import { LivePollen } from "@/components/LivePollen";
import { AirQualityPanel } from "@/components/AirQualityPanel";
import { AirQualityDashboard } from "@/components/AirQualityDashboard";
import { UvCloudPanel } from "@/components/UvCloudPanel";
import { IndoorAirSection } from "@/components/IndoorAirSection";
import { FloatingCandles } from "@/components/FloatingCandles";
import { useUserLocation, UserLocationBar } from "@/hooks/use-user-location";
import heroImg from "@/assets/hogwarts-luftkvalitet.jpg";

const BORGEN_TOLLNES = { lat: 59.1789, lon: 9.5732 };
const HYTTA_NUMEDAL = { lat: 59.91, lon: 9.07 };


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

function PollenPage() {
  const userLoc = useUserLocation("pollen");

  return (
    <PageShell>
      <div className="theme-hogwarts relative">
        <FloatingCandles />
      <PageHero
        eyebrow="Astronomitårnet · Skien & Numedal"
        title="Luftkvalitet"
        subtitle="Pollen, UV, svevestøv, ozon og gasser — trolldom lest av maesteren time for time."
        image={heroImg}
      />


      <section className="container mx-auto px-4 pt-6 flex flex-col items-center gap-3">
        <p className="max-w-2xl text-center text-xs text-muted-foreground leading-relaxed">
          Samlet oversikt over alt som påvirker lufta du puster inn: pollen
          (bjørk, gress, or, burot m.fl.), UV-stråling, svevestøv (PM2.5 og
          PM10), bakkenært ozon (O₃), nitrogendioksid (NO₂), svoveldioksid
          (SO₂), karbonmonoksid (CO) og mineralstøv. Alle målinger hentes fra
          felles cache som varmes opp av cron-jobben hver halvtime.
        </p>
      </section>


      <section className="container mx-auto px-4 pt-8 space-y-5">
        <UserLocationBar page="pollen" state={userLoc} readOnlyWho />
      </section>

      <section className="container mx-auto px-4 py-10 space-y-12">
        <div>
          <SectionHeader
            eyebrow="Live luftkvalitet · Open-Meteo"
            title="Akkurat nå i lufta"
          />
          <div className="grid lg:grid-cols-2 gap-6 mt-6">
            <AirQualityPanel
              lat={BORGEN_TOLLNES.lat}
              lon={BORGEN_TOLLNES.lon}
              title="Borgen · Tollnes, Skien"
              subtitle="AQI, UV, svevestøv, ozon og gasser"
            />
            <AirQualityPanel
              lat={HYTTA_NUMEDAL.lat}
              lon={HYTTA_NUMEDAL.lon}
              title="Hytta · Lyngdal i Numedal"
              subtitle="Renere fjell-luft — sammenlign med byen"
            />
          </div>
        </div>

        <div>
          <SectionHeader
            eyebrow="UV-prognose · Open-Meteo"
            title="UV med og uten skydekke"
          />
          <div className="grid lg:grid-cols-2 gap-6 mt-6">
            <UvCloudPanel
              lat={BORGEN_TOLLNES.lat}
              lon={BORGEN_TOLLNES.lon}
              title="Borgen · Tollnes, Skien"
              subtitle="Klikk grafen for detaljert visning"
            />
            <UvCloudPanel
              lat={HYTTA_NUMEDAL.lat}
              lon={HYTTA_NUMEDAL.lon}
              title="Hytta · Lyngdal i Numedal"
              subtitle="Klar himmel-UV vs faktisk UV"
            />
          </div>
        </div>

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
              lat={HYTTA_NUMEDAL.lat}
              lon={HYTTA_NUMEDAL.lon}
              title="Hytta · Lyngdal i Numedal"
              subtitle="Live pollen for Numedal — sesongen kommer 1–2 uker senere"
              naafRegion="indreOstlandet"
            />
          </div>
        </div>

        <div>
          <SectionHeader
            eyebrow="Innendørs · Airthings via Homey"
            title="Radon & VOC — kjeller og stue"
          />
          <div className="mt-6">
            <IndoorAirSection />
          </div>
        </div>

        <div>
          <SectionHeader
            eyebrow="Analyse & innsikt · Skien Tollnes"
            title="Komplett luftkvalitetsdashbord"
          />
          <div className="mt-6">
            <AirQualityDashboard
              locationKey="borgen-tollnes"
              lat={BORGEN_TOLLNES.lat}
              lon={BORGEN_TOLLNES.lon}
              title="Borgen · Tollnes, Skien"
              subtitle="Historikk, trender, sesonger og korrelasjoner"
            />
          </div>
        </div>
      </section>

    </PageShell>
  );
}

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
