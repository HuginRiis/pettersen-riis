import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/PageShell";
import { RoborockPanel } from "@/components/RoborockPanel";
import heroImg from "@/assets/got-smarthus.jpg";

export const Route = createFileRoute("/stovsugeren")({
  head: () => ({
    meta: [
      { title: "Støvsugeren | House Pettersen-Riis" },
      { name: "description", content: "Roborock-støvsugerne på Borgen og hytta — status, sugekraft, mopp og kommandoer." },
      { property: "og:title", content: "Støvsugeren" },
      { property: "og:description", content: "Begge Roborock-støvsugere samlet på ett sted." },
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
        subtitle="Roborock på Borgen og på hytta."
        image={heroImg}
      />
      <RoborockPanel />
    </PageShell>
  );
}
