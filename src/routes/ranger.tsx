import { createFileRoute } from "@tanstack/react-router";
import {
  Fuel,
  Gauge,
  Mountain,
  Cog,
  Ruler,
  Award,
  Crown,
  Shield,
  Sparkles,
  Wrench,
  Truck,
  Zap,
} from "lucide-react";
import { PageShell, PageHero } from "@/components/PageShell";
import rangerImg from "@/assets/ranger.jpg";

export const Route = createFileRoute("/ranger")({
  head: () => ({
    meta: [
      { title: "Ranger — Ford Ranger | House Pettersen Riis" },
      {
        name: "description",
        content:
          "Krøniken om Ranger — borgens grenseridder. Spesifikasjoner, drivverk og terrengets visdom for Ford Ranger.",
      },
      { property: "og:title", content: "Ranger — Ford Ranger" },
      {
        property: "og:description",
        content:
          "Borgens grenseridder — full krønike om Ford Ranger med ytelse, terreng og praktisk visdom.",
      },
      { property: "og:image", content: rangerImg },
      { property: "twitter:image", content: rangerImg },
    ],
  }),
  component: RangerPage,
});

function RangerPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Borgens grenseridder"
        title="Ranger"
        subtitle="Ford Ranger — den brede skuldrede ulven fra Dearborn. Bygget for grus, gjørme og gjerdeposter, lojal som en ed."
        image={rangerImg}
      />

      <section className="container mx-auto px-4 py-12 max-w-6xl space-y-12">
        {/* Krønikens åpning */}
        <article className="panel rounded-lg p-6 md:p-8">
          <h2 className="text-2xl text-primary mb-3 flex items-center gap-2">
            <Crown size={22} /> Krønikens åpning
          </h2>
          <p className="text-foreground/85 leading-relaxed mb-3">
            Ranger er ikke en ganger av lyn, men av jern og diesel — født av
            mestre i Dearborn og smidd for ridt over alle riker. Der Jernhesten
            gleder seg over asfaltens silke, sukker Ranger først når veien
            slipper opp og terrenget tar over.
          </p>
          <p className="text-foreground/85 leading-relaxed">
            I borgens stall står den som grensevakten — en pickup med rikets
            eldgamle dyd: bær det som skal bæres, dra det som skal dras, og bring
            husfolket trygt hjem når snøen legger seg over Telemarks åser.
          </p>
        </article>

        {/* Spesifikasjoner */}
        <section>
          <h2 className="text-2xl text-primary mb-5 flex items-center gap-2">
            <Award size={22} /> Gangerens segl
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Spec icon={Fuel} label="Motor" value="2,0 EcoBlue" sub="Bi-turbo diesel" />
            <Spec icon={Zap} label="Effekt" value="213 hk" sub="500 Nm dreiemoment" />
            <Spec icon={Gauge} label="0–100 km/t" value="≈ 9,0 sek" sub="Tungvektsadel" />
            <Spec icon={Cog} label="Drev" value="4WD" sub="10-trinns automat" />
            <Spec icon={Mountain} label="Bakkeklaring" value="232 mm" sub="Vader 800 mm" />
            <Spec icon={Truck} label="Hengervekt" value="3 500 kg" sub="Tilhenger m/brems" />
            <Spec icon={Ruler} label="Lasteplan" value="1 544 mm" sub="× 1 224 mm bredt" />
            <Spec icon={Shield} label="Vekt" value="≈ 2 300 kg" sub="Bygget av jern" />
          </div>
        </section>

        {/* Funksjoner */}
        <section>
          <h2 className="text-2xl text-primary mb-5 flex items-center gap-2">
            <Sparkles size={22} /> Borgens utstyr
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            <Card title="Terreng-modi">
              Sand, gjørme, stein, snø — Ranger leser undergrunnen og fordeler
              kraften slik en gammel speider leser sporet.
            </Card>
            <Card title="Differensialsperre bak">
              Når ett hjul sklir på isen, holder den andre stand. En grenseridder
              gir ikke opp ved første glatte kne.
            </Card>
            <Card title="SYNC 4 / 12-tommers skjerm">
              Navigasjon, Apple CarPlay og Android Auto trådløst — kart over
              borgens grenseland alltid for hånden.
            </Card>
            <Card title="Adaptiv cruise & spor">
              Holder avstand og kjørefelt på den lange marsj — også med
              tilhenger på slep.
            </Card>
            <Card title="360° kamera">
              Fugleperspektiv ved trange tun og bratte stier — et øye for hver
              himmelretning.
            </Card>
            <Card title="Tilhengerassistent">
              Reverserer hengeren med en knottevri — selv stallmesteren får hvile
              skuldrene.
            </Card>
          </div>
        </section>

        {/* Praktisk */}
        <section className="grid md:grid-cols-2 gap-4">
          <article className="panel rounded-lg p-6">
            <h3 className="text-xl text-primary mb-3">Mål & last</h3>
            <ul className="space-y-1.5 text-sm text-foreground/85">
              <Li>Lengde: <strong>5 370 mm</strong></Li>
              <Li>Bredde: <strong>1 918 mm</strong> (uten speil)</Li>
              <Li>Akselavstand: <strong>3 270 mm</strong></Li>
              <Li>Lasteplan: <strong>1 544 × 1 224 mm</strong></Li>
              <Li>Nyttelast: <strong>≈ 1 000 kg</strong></Li>
              <Li>Hengervekt m/brems: <strong>3 500 kg</strong></Li>
            </ul>
          </article>
          <article className="panel rounded-lg p-6">
            <h3 className="text-xl text-primary mb-3">Forbruk & terreng</h3>
            <ul className="space-y-1.5 text-sm text-foreground/85">
              <Li>Forbruk WLTP: <strong>≈ 8,7 l/100 km</strong></Li>
              <Li>CO₂: <strong>≈ 230 g/km</strong></Li>
              <Li>Tankvolum: <strong>80 liter</strong></Li>
              <Li>Vadedybde: <strong>800 mm</strong></Li>
              <Li>Stigning: <strong>opptil 45°</strong></Li>
              <Li>Service-intervall: <strong>1 år / 30 000 km</strong></Li>
            </ul>
          </article>
        </section>

        {/* Mesterens råd */}
        <article className="panel rounded-lg p-6 md:p-8 border-primary/30">
          <h2 className="text-2xl text-primary mb-3 flex items-center gap-2">
            <Wrench size={20} /> Mesterens råd
          </h2>
          <p className="text-foreground/85 leading-relaxed mb-2">
            «Ranger er bygget for arbeid — la den arbeide. Men husk å la den hvile
            når dieselen er kald, og smør hengerfestet før den første snøen
            faller. Slik vil grensevakten tjene huset i mange ferder.»
          </p>
          <p className="text-xs text-muted-foreground italic">
            — Mester Aemon av Dearborn
          </p>
        </article>
      </section>
    </PageShell>
  );
}

function Spec({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Fuel;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="panel rounded-lg p-4 text-center">
      <Icon size={20} className="text-primary mx-auto mb-2" />
      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </div>
      <div className="text-lg text-foreground font-semibold mt-1">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="panel rounded-lg p-5 glow-on-hover">
      <h3 className="text-primary text-base mb-2">{title}</h3>
      <p className="text-sm text-foreground/85 leading-relaxed">{children}</p>
    </article>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="text-primary">·</span>
      <span>{children}</span>
    </li>
  );
}
