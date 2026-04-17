import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/PageShell";
import arnePortrait from "@/assets/arne-portrait.jpg";
import rebekkaPortrait from "@/assets/rebekka-portrait.jpg";
import heroImg from "@/assets/hero-westeros.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "House Riis — Arne & Rebekka av Skien" },
      {
        name: "description",
        content:
          "Den offisielle krøniken om House Riis: Arne Riis og Rebekka Riis Pettersen i Skien. Agenda, vær, pollen, hytta, hundene og trening.",
      },
      { property: "og:title", content: "House Riis — Arne & Rebekka av Skien" },
      {
        property: "og:description",
        content: "Familiens digitale storsal — i Game of Thrones-ånd.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Krøniken om"
        title="House Riis av Skien"
        subtitle="Arne Riis og Rebekka Riis Pettersen — vinterens voktere ved fjorden."
        image={heroImg}
      />

      <section className="container mx-auto px-4 py-16">
        <div className="ornate-divider mb-10">
          <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
            Husets herskere
          </span>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <PortraitCard
            name="Arne Riis"
            title="Lord av Skien"
            words="Med ære og ravner"
            image={arnePortrait}
          />
          <PortraitCard
            name="Rebekka Riis Pettersen"
            title="Lady av Skien"
            words="Sterk som vinterstormen"
            image={rebekkaPortrait}
          />
        </div>
      </section>

      <section className="container mx-auto px-4 pb-20">
        <div className="ornate-divider mb-10">
          <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
            Husets sale
          </span>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <HallCard to="/agenda" title="Krøniken" desc="Agenda og meldinger med dato og emne." icon="📜" />
          <HallCard to="/var" title="Værens budskap" desc="Værmelding og pollenvarsel for Skien." icon="🌨" />
          <HallCard to="/hytta" title="Hytta" desc="Husets tilflukt i fjellet." icon="🏔" />
          <HallCard to="/hundene" title="Hundene" desc="Husets tro følgesvenner." icon="🐺" />
          <HallCard to="/trening" title="Treningssalen" desc="Kroppen som rustning." icon="⚔️" />
          <HallCard to="/agenda" title="Send melding" desc="Skriv en kort hilsen til kalenderen." icon="🪶" />
        </div>
      </section>
    </PageShell>
  );
}

function PortraitCard({
  name,
  title,
  words,
  image,
}: {
  name: string;
  title: string;
  words: string;
  image: string;
}) {
  return (
    <article className="panel rounded-lg overflow-hidden glow-on-hover">
      <div className="aspect-[4/5] overflow-hidden border-b border-border">
        <img
          src={image}
          alt={name}
          className="w-full h-full object-cover"
          loading="lazy"
          width={1024}
          height={1280}
        />
      </div>
      <div className="p-6 text-center">
        <div className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
          {title}
        </div>
        <h3 className="text-2xl mt-2 text-foreground">{name}</h3>
        <p className="mt-3 text-medieval text-primary text-lg">"{words}"</p>
      </div>
    </article>
  );
}

function HallCard({
  to,
  title,
  desc,
  icon,
}: {
  to: "/agenda" | "/var" | "/hytta" | "/hundene" | "/trening";
  title: string;
  desc: string;
  icon: string;
}) {
  return (
    <Link
      to={to}
      className="panel rounded-lg p-6 glow-on-hover block group"
    >
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-xl text-primary group-hover:text-gold transition-colors">
        {title}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
    </Link>
  );
}
