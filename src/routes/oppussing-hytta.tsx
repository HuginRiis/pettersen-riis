import { createFileRoute } from "@tanstack/react-router";
import { RenovationPage } from "@/components/RenovationPage";
import heroImg from "@/assets/hero-westeros.jpg";

export const Route = createFileRoute("/oppussing-hytta")({
  head: () => ({
    meta: [
      { title: "Oppussing av hytta — House Pettersen Riis" },
      {
        name: "description",
        content:
          "Krøniken om byggverk på hytta — prosjekter, planer og fremdrift i fjellet ved Flesberg.",
      },
      { property: "og:title", content: "Oppussing av hytta — House Pettersen Riis" },
      {
        property: "og:description",
        content: "Husets pågående og planlagte byggverk på hytta.",
      },
    ],
  }),
  component: () => (
    <RenovationPage
      location="hytta"
      hero={{
        eyebrow: "Tilflukt i fjellet",
        title: "Oppussing av hytta",
        subtitle:
          "Tømmer og torv, hammer og hånd — krøniken om husets tilflukt ved Bjørkesetvegen.",
        image: heroImg,
      }}
      emptyTitle="Hytta venter"
      emptyHint="Reis det første prosjektet for husets tilflukt i fjellet."
    />
  ),
});
