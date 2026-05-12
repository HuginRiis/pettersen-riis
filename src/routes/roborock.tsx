import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/PageShell";
import { RoborockPanel } from "@/components/RoborockPanel";

export const Route = createFileRoute("/roborock")({
  head: () => ({
    meta: [
      { title: "Roborock | House Pettersen-Riis" },
      { name: "description", content: "Roborock-status og innlogging." },
    ],
  }),
  component: RoborockRoute,
});

function RoborockRoute() {
  return (
    <PageShell>
      <PageHero title="Roborock" subtitle="Innlogging og status fra skyen" />
      <RoborockPanel />
    </PageShell>
  );
}
