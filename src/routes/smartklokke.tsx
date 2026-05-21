import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/PageShell";
import { SmartklokkePanel } from "@/components/SmartklokkePanel";
import smartklokkeImg from "@/assets/got-smartklokke.jpg";

export const Route = createFileRoute("/smartklokke")({
  head: () => ({
    meta: [
      { title: "Smartklokke — Fenix 8 | House Pettersen Riis" },
      {
        name: "description",
        content:
          "Komplett Garmin-detalj for Arne (Fenix 8 Pro) og Rebekka (Fenix 8 AMOLED) — siste 7 dager med alle målinger.",
      },
      { property: "og:title", content: "Smartklokke | House Pettersen Riis" },
      {
        property: "og:description",
        content: "Garmin Fenix 8 — full krønike: HRV, søvn, kropp, trening, klokke og mer.",
      },
      { property: "og:image", content: smartklokkeImg },
    ],
  }),
  component: SmartklokkePage,
});

function SmartklokkePage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Husets bærere av tid"
        title="Smartklokke"
        subtitle="Arne sin Fenix 8 Pro og Rebekka sin Fenix 8 AMOLED — alt klokken vet, siste 7 dager."
        image={smartklokkeImg}
      />
      <section className="container mx-auto px-4 py-10">
        <SmartklokkePanel />
      </section>
    </PageShell>
  );
}
