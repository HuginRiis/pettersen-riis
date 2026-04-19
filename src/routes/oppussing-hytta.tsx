import { createFileRoute } from "@tanstack/react-router";
import { RenovationPage } from "@/components/renovation/RenovationPage";
import heroImg from "@/assets/hero-westeros.jpg";

export const Route = createFileRoute("/oppussing-hytta")({
  head: () => ({
    meta: [
      { title: "Prosjekter på hytta — House Pettersen Riis" },
      {
        name: "description",
        content:
          "Krøniken om byggverk på hytta — prosjekter, planer og fremdrift i fjellet ved Flesberg.",
      },
      { property: "og:title", content: "Prosjekter på hytta — House Pettersen Riis" },
      {
        property: "og:description",
        content: "Husets pågående og planlagte prosjekter på hytta.",
      },
    ],
  }),
  component: () => (
    <RenovationPage
      location="hytta"
      hero={{
        eyebrow: "Tilflukt i fjellet",
        title: "Prosjekter på hytta",
        subtitle:
          "Tømmer og torv, hammer og hånd — krøniken om husets tilflukt ved Bjørkesetvegen.",
        image: heroImg,
      }}
      emptyTitle="Hytta venter"
      emptyHint="Reis det første prosjektet for husets tilflukt i fjellet."
    />
  ),
});
