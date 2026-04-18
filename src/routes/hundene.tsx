import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/PageShell";
import hundeneImg from "@/assets/hundene-pack.jpg";
import dogSnow from "@/assets/dog-snow.jpg";
import dogShadow from "@/assets/dog-shadow.jpg";
import dogEmber from "@/assets/dog-ember.jpg";

export const Route = createFileRoute("/hundene")({
  head: () => ({
    meta: [
      { title: "Hundene — Husets ulver | House Riis Pettersen" },
      { name: "description", content: "House Riis Pettersen' tro følgesvenner — husets vakthunder." },
      { property: "og:title", content: "Hundene | House Riis Pettersen" },
      { property: "og:description", content: "Husets tro følgesvenner og vakthunder." },
      { property: "og:image", content: hundeneImg },
    ],
  }),
  component: HundenePage,
});

const dogs = [
  {
    name: "Snø",
    image: dogSnow,
    breed: "Husets vokter",
    words: "Stille som snøfall",
    traits: ["Lojal", "Mild", "Vaktsom"],
  },
  {
    name: "Blomst",
    image: dogShadow,
    breed: "Husets jeger",
    words: "Sterk som vinternatten",
    traits: ["Modig", "Skarp", "Urokkelig"],
  },
  {
    name: "Lilje",
    image: dogEmber,
    breed: "Husets flamme",
    words: "Rask som lynet",
    traits: ["Energisk", "Lekende", "Uredd"],
  },
];

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

        <div className="grid md:grid-cols-3 gap-6">
          {dogs.map((d) => (
            <DogCard key={d.name} {...d} />
          ))}
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
  image,
}: {
  name: string;
  breed: string;
  words: string;
  traits: string[];
  image: string;
}) {
  return (
    <article className="panel rounded-lg overflow-hidden glow-on-hover flex flex-col">
      <div className="relative aspect-[3/4] overflow-hidden">
        <img
          src={image}
          alt={`${name} — ${breed}`}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, transparent 50%, oklch(0.10 0.01 240 / 0.85) 100%)",
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="text-[10px] uppercase tracking-[0.3em] text-primary/90">
            {breed}
          </div>
          <h3 className="text-3xl text-primary text-medieval leading-none mt-1">
            {name}
          </h3>
        </div>
      </div>
      <div className="p-5 flex-1 flex flex-col">
        <p className="text-medieval text-base text-foreground/90">"{words}"</p>
        <div className="flex flex-wrap gap-2 mt-4">
          {traits.map((t) => (
            <span
              key={t}
              className="text-[10px] px-2.5 py-1 rounded-full border border-primary/40 text-primary tracking-wider uppercase"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}
