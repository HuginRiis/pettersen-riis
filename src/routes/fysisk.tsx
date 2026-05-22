import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/PageShell";
import { StravaHouses } from "@/routes/trening";
import fysiskImg from "@/assets/got-fysisk.jpg";

export const Route = createFileRoute("/fysisk")({
  head: () => ({
    meta: [
      { title: "Fysisk — Gåing, sykling og løping | House Pettersen Riis" },
      {
        name: "description",
        content:
          "Husets fysiske krønike — Strava-data for gåing, sykling og løping. Ukens innsats, trender, totaler og siste turer.",
      },
      { property: "og:title", content: "Fysisk | House Pettersen Riis" },
      { property: "og:description", content: "Gåing, sykling, løping — husets fysiske krønike fra Strava." },
      { property: "og:image", content: fysiskImg },
    ],
  }),
  component: FysiskPage,
});

function FysiskPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Husets utholdenhet"
        title="Fysisk"
        subtitle="Gåing, sykling og løping — ferden måles i steg, omdreininger og puls."
        image={fysiskImg}
      />

      <section className="container mx-auto px-4 py-12 space-y-16">
        <StravaHouses />
      </section>
    </PageShell>
  );
}
