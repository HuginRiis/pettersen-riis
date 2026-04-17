import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/PageShell";
import treningImg from "@/assets/trening.jpg";

export const Route = createFileRoute("/trening")({
  head: () => ({
    meta: [
      { title: "Treningssalen — Kroppen som rustning | House Riis" },
      { name: "description", content: "Husets treningsrutine — styrke, utholdenhet og vinterens disiplin." },
      { property: "og:title", content: "Treningssalen | House Riis" },
      { property: "og:description", content: "Styrke, utholdenhet og disiplin." },
      { property: "og:image", content: treningImg },
    ],
  }),
  component: TreningPage,
});

const week = [
  { day: "Mandag", focus: "Styrke", exercises: ["Knebøy 5×5", "Markløft 3×5", "Press 3×8"] },
  { day: "Tirsdag", focus: "Kondisjon", exercises: ["Løpetur 5 km", "Tøying 15 min"] },
  { day: "Onsdag", focus: "Hvile", exercises: ["Lett gåtur", "Mobility"] },
  { day: "Torsdag", focus: "Styrke", exercises: ["Benk 5×5", "Pull-ups 4×8", "Plank 3×60s"] },
  { day: "Fredag", focus: "Intervall", exercises: ["HIIT 20 min", "Core 10 min"] },
  { day: "Lørdag", focus: "Tur", exercises: ["Lang tur i marka", "Fjelltur"] },
  { day: "Søndag", focus: "Restitusjon", exercises: ["Yoga", "Sauna"] },
];

function TreningPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Husets disiplin"
        title="Treningssalen"
        subtitle="Kroppen er rustning. Disiplin er sverd."
        image={treningImg}
      />

      <section className="container mx-auto px-4 py-12">
        <div className="ornate-divider mb-8">
          <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
            Ukens program
          </span>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {week.map((d) => (
            <article key={d.day} className="panel rounded-lg p-5 glow-on-hover">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xl text-primary">{d.day}</h3>
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  {d.focus}
                </span>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm text-foreground/90">
                {d.exercises.map((e) => (
                  <li key={e} className="flex gap-2">
                    <span className="text-primary">⚔</span>
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="mt-12 grid md:grid-cols-3 gap-4">
          <Quote text="Sverdet sliper seg ikke selv." />
          <Quote text="Vinteren belønner den som forberedte seg om sommeren." />
          <Quote text="En dag uten innsats er en dag tapt." />
        </div>
      </section>
    </PageShell>
  );
}

function Quote({ text }: { text: string }) {
  return (
    <div className="panel rounded-lg p-5 text-center">
      <p className="text-medieval text-lg text-primary">"{text}"</p>
    </div>
  );
}
