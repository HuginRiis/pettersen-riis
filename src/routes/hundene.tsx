import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/PageShell";
import hundeneImg from "@/assets/hundene.jpg";

export const Route = createFileRoute("/hundene")({
  head: () => ({
    meta: [
      { title: "Hundene — Husets ulver | House Riis" },
      { name: "description", content: "House Riis' tro følgesvenner — husets vakthunder." },
      { property: "og:title", content: "Hundene | House Riis" },
      { property: "og:description", content: "Husets tro følgesvenner og vakthunder." },
      { property: "og:image", content: hundeneImg },
    ],
  }),
  component: HundenePage,
});

function HundenePage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Husets ulver"
        title="Hundene"
        subtitle="De våker, de leker, de elsker — husets tro vakter."
        image={hundeneImg}
      />

      <section className="container mx-auto px-4 py-12">
        <div className="ornate-divider mb-8">
          <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
            Husets følgesvenner
          </span>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <DogCard
            name="Skygge"
            breed="Husets vokter"
            words="Stille som vinden"
            traits={["Lojal", "Modig", "Rolig"]}
          />
          <DogCard
            name="Storm"
            breed="Husets jeger"
            words="Rask som lynet"
            traits={["Energisk", "Lekende", "Skarp"]}
          />
        </div>

        <div className="mt-12 panel rounded-lg p-6">
          <h3 className="text-xl text-primary mb-3">Daglige sysler</h3>
          <ul className="grid sm:grid-cols-2 gap-3 text-sm text-muted-foreground">
            <li>🌅 Morgentur i skogen — 30 min</li>
            <li>🍖 Frokost kl. 07:30</li>
            <li>🎾 Lek og trening på dagen</li>
            <li>🌲 Lang tur ettermiddag — 60 min</li>
            <li>🍲 Middag kl. 17:00</li>
            <li>🌙 Kveldsrunde før sengetid</li>
          </ul>
        </div>
      </section>
    </PageShell>
  );
}

function DogCard({
  name,
  breed,
  words,
  traits,
}: {
  name: string;
  breed: string;
  words: string;
  traits: string[];
}) {
  return (
    <article className="panel rounded-lg p-6 glow-on-hover">
      <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
        {breed}
      </div>
      <h3 className="text-3xl text-primary mt-1">{name}</h3>
      <p className="text-medieval text-lg mt-2 text-foreground/90">"{words}"</p>
      <div className="flex flex-wrap gap-2 mt-4">
        {traits.map((t) => (
          <span
            key={t}
            className="text-xs px-2.5 py-1 rounded-full border border-primary/40 text-primary tracking-wider uppercase"
          >
            {t}
          </span>
        ))}
      </div>
    </article>
  );
}
