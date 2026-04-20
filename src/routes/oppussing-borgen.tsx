import { createFileRoute } from "@tanstack/react-router";
import { RenovationPage } from "@/components/renovation/RenovationPage";
import heroImg from "@/assets/got-oppussing-borgen.jpg";

export const Route = createFileRoute("/oppussing-borgen")({
  head: () => ({
    meta: [
      { title: "Prosjekter på Borgen — House Pettersen Riis" },
      {
        name: "description",
        content:
          "Krøniken om byggverk på borgen — prosjekter, planer og fremdrift for hjemmet i Skien.",
      },
      { property: "og:title", content: "Prosjekter på Borgen — House Pettersen Riis" },
      {
        property: "og:description",
        content: "Husets pågående og planlagte prosjekter på borgen.",
      },
    ],
  }),
  component: () => (
    <RenovationPage
      location="borg"
      hero={{
        eyebrow: "Husets byggmestere",
        title: "Prosjekter på Borgen",
        subtitle:
          "Stein på stein, planke etter planke — krøniken om hjemmets gjenreisning i Skien.",
        image: heroImg,
      }}
      emptyTitle="Ingen byggverk ennå"
      emptyHint="Reis det første prosjektet — fra nytt tak til ny storsal."
    />
  ),
});
