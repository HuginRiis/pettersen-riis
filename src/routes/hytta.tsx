import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/PageShell";
import hyttaImg from "@/assets/hytta-aurora.jpg";

export const Route = createFileRoute("/hytta")({
  head: () => ({
    meta: [
      { title: "Hytta — House Riis' tilflukt" },
      { name: "description", content: "Husets hytte — fjellets ro, peiskos og lange skiturer." },
      { property: "og:title", content: "Hytta | House Riis" },
      { property: "og:description", content: "Vinterens favorittsted i fjellet." },
      { property: "og:image", content: hyttaImg },
    ],
  }),
  component: HyttaPage,
});

function HyttaPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Husets tilflukt"
        title="Hytta"
        subtitle="Bortenfor fjordene venter peisens varme"
        image={hyttaImg}
      />

      <section className="container mx-auto px-4 py-12 grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-5">
          <div className="ornate-divider mb-2">
            <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">Krøniken om hytta</span>
          </div>
          <p className="text-foreground/90 leading-relaxed">
            Når vintervindene feier over Skien, søker House Riis tilflukt i tømmerhytta. Røyken stiger fra pipa, peisen
            knitrer, og ravnene holder vakt i grantrærne utenfor.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Her samles familien til turer, brettspill, og lange måltider. Hytta er hjertet av husets ro — et sted hvor
            tiden går saktere og hvor stjernene står klarere.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4">
            <Stat label="Hovedhall — sengeplasser" value="4" />
            <Stat label="Annekset — sengeplasser" value="4" />
            <Stat label="Høyde over havet" value="598 moh" />
            <Stat label="Ildsted" value="1" />
            <Stat label="Forbrenningsdoer" value="2" />
            <Stat label="Boblebad" value="1" />
          </div>
        </div>

        <aside className="panel rounded-lg p-6 h-fit">
          <h3 className="text-lg text-primary mb-3">Hyttebudet</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>🔥 Mat ildstedet før mørket faller</li>
            <li>🪵 Fyll vedkurven — vinteren kommer</li>
            <li>♨️ Tem boblebadet, men vokt dampen</li>
            <li>🚽 Brenn det som brennes må — to forbrenningstroner venter</li>
            <li>🐺 Hold ulveflokken samlet ved fjellkanten</li>
            <li>🕯 Slokk hver flamme før dere rir ut</li>
          </ul>
        </aside>
      </section>
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel rounded p-4 text-center">
      <div className="text-2xl text-primary text-medieval">{value}</div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
