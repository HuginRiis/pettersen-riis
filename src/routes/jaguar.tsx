import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/PageShell";
import { JaguarPanel } from "@/components/JaguarPanel";
import heroImg from "@/assets/got-jaguar.jpg";

export const Route = createFileRoute("/jaguar")({
  head: () => ({
    meta: [
      { title: "Jaguar | House Pettersen-Riis" },
      { name: "description", content: "Jaguar Remote — status og styring av bilen." },
      { property: "og:title", content: "Jaguar | House Pettersen-Riis" },
      { property: "og:description", content: "Jaguar Remote — status og styring av bilen." },
    ],
  }),
  component: JaguarRoute,
});

function JaguarRoute() {
  return (
    <PageShell>
      <PageHero
        title="Jaguar"
        subtitle="Innlogging og styring via Jaguar Remote (InControl)"
        image={heroImg}
      />
      <JaguarPanel />
    </PageShell>
  );
}
