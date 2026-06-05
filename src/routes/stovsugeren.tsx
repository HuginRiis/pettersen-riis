import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/PageShell";
import { StovsugerenPanel } from "@/components/StovsugerenPanel";
import { VacuumScene } from "@/components/VacuumScene";
import heroImg from "@/assets/got-stovsuger-hero.jpg";

export const Route = createFileRoute("/stovsugeren")({
  head: () => ({
    meta: [
      { title: "Støvsugeren | House Pettersen-Riis" },
      { name: "description", content: "Roborock-støvsugerne på Borgen og hytta — status, sugekraft, mopp og kommandoer." },
      { property: "og:title", content: "Støvsugeren" },
      { property: "og:description", content: "Begge Roborock-støvsugere samlet på ett sted." },
      { property: "og:image", content: heroImg },
    ],
  }),
  component: StovsugerenPage,
});

function StovsugerenPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Borgens tjenere"
        title="Støvsugeren"
        subtitle="Roborock-knektene på Borgen og på hytta — alle detaljer, alle befalinger."
        image={heroImg}
      />
      <section className="container mx-auto px-4 pt-10">
        <VacuumScene />
      </section>
      <StovsugerenPanel />
    </PageShell>
  );
}
