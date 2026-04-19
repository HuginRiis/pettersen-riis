import { createFileRoute } from "@tanstack/react-router";
import { RenovationPage } from "@/components/RenovationPage";
import heroImg from "@/assets/hero-westeros.jpg";

export const Route = createFileRoute("/oppussing-borgen")({
  head: () => ({
    meta: [
      { title: "Oppussing av borgen — House Pettersen Riis" },
      {
        name: "description",
        content:
          "Krøniken om byggverk i borgen — prosjekter, planer og fremdrift for hjemmet i Skien.",
      },
      { property: "og:title", content: "Oppussing av borgen — House Pettersen Riis" },
      {
        property: "og:description",
        content: "Husets pågående og planlagte byggverk i borgen.",
      },
    ],
  }),
  component: () => (
    <RenovationPage
      location="borg"
      hero={{
        eyebrow: "Husets byggmestere",
        title: "Oppussing av borgen",
        subtitle:
          "Stein på stein, planke etter planke — krøniken om hjemmets gjenreisning i Skien.",
        image: heroImg,
      }}
      emptyTitle="Ingen byggverk ennå"
      emptyHint="Reis det første prosjektet — fra nytt tak til ny storsal."
    />
  ),
});
