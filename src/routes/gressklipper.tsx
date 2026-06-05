import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/PageShell";
import { GardenaPanel } from "@/components/GardenaPanel";
import heroImg from "@/assets/got-gressklipper.jpg";

export const Route = createFileRoute("/gressklipper")({
  head: () => ({
    meta: [
      { title: "Gressklipper · Gardena | House Pettersen-Riis" },
      {
        name: "description",
        content: "Sanntidsstatus, batteri, aktivitet og kommandoer for Gardena-gressklippere.",
      },
    ],
  }),
  component: GressklipperRoute,
});

function GressklipperRoute() {
  return (
    <PageShell>
      <PageHero
        title="Gressklipper"
        subtitle="Sanntid fra Gardena Smart System — alle statuser og kjøringer"
        image={heroImg}
      />
      <GardenaPanel />
    </PageShell>
  );
}
