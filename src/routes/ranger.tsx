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
        eyebrow="Borgens grenseridder · Anno 2019"
        title="Ranger"
        subtitle="Ford Ranger Wildtrak 2019 — den brede skuldrede ulven fra Silverton. Bygget for grus, gjørme og gjerdeposter, lojal som en ed."
        image={rangerImg}
      />

      <section className="container mx-auto px-4 py-12 max-w-6xl space-y-12">
        {/* Krønikens åpning */}
        <article className="panel rounded-lg p-6 md:p-8">
          <h2 className="text-2xl text-primary mb-3 flex items-center gap-2">
            <Crown size={22} /> Krønikens åpning
          </h2>
          <p className="text-foreground/85 leading-relaxed mb-3">
            I året 2019 trådte den fornyede Ranger frem fra Fords smie i Silverton —
            T6-generasjonens ansiktsløftning bar nytt 2,0-liters bi-turbo
            EcoBlue-hjerte og en 10-trinns automat smidd i samarbeid med rivalen
            fra General Motors. Et sjeldent forbund mellom to jarler.
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
            <Award size={22} /> Gangerens segl · 2019 Wildtrak 2.0 Bi-Turbo
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Spec icon={Fuel} label="Motor" value="2,0 EcoBlue" sub="Bi-turbo diesel · 1 996 ccm" />
            <Spec icon={Zap} label="Effekt" value="213 hk" sub="500 Nm @ 1 750–2 000 o/min" />
            <Spec icon={Gauge} label="0–100 km/t" value="≈ 9,0 sek" sub="Toppfart 180 km/t" />
            <Spec icon={Cog} label="Drev" value="4WD" sub="10-trinns automat · low-range" />
            <Spec icon={Mountain} label="Bakkeklaring" value="232 mm" sub="Vader 800 mm" />
            <Spec icon={Truck} label="Hengervekt" value="3 500 kg" sub="Tilhenger m/brems" />
            <Spec icon={Ruler} label="Lasteplan" value="1 549 mm" sub="× 1 560 mm bredt" />
            <Spec icon={Shield} label="Egenvekt" value="≈ 2 269 kg" sub="Bygget av jern" />
          </div>
        </section>

        {/* Funksjoner */}
        <section>
          <h2 className="text-2xl text-primary mb-5 flex items-center gap-2">
            <Sparkles size={22} /> Borgens utstyr · 2019-årgangen
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            <Card title="Terrain Management System">
              Fire kjøremoduser — Normal, Gress/Grus/Snø, Sand og Stein — og
              Ranger leser undergrunnen som en gammel speider leser sporet.
            </Card>
            <Card title="Differensialsperre bak">
              Elektronisk låsing av bakdifferensialet. Når ett hjul sklir på
              isen, holder den andre stand.
            </Card>
            <Card title="SYNC 3 · 8-tommers skjerm">
              Apple CarPlay og Android Auto med kabel, navigasjon og DAB+ —
              kart over borgens grenseland alltid for hånden.
            </Card>
            <Card title="Adaptiv cruise & nødbrems">
              Adaptiv fartsholder med Forward Collision Alert og Active Braking
              — nyttig på den lange marsj med tilhenger på slep.
            </Card>
            <Card title="Ryggekamera & parksensorer">
              Ryggekamera med dynamiske linjer, sensorer foran og bak. Et øye
              for trange tun og bratte stier.
            </Card>
            <Card title="Hill Descent Control">
              Holder lav fart automatisk i bratte nedoverbakker — selv på is og
              våt grus. Stallmesteren får hvile skuldrene.
            </Card>
          </div>
        </section>

        {/* Praktisk */}
        <section className="grid md:grid-cols-2 gap-4">
          <article className="panel rounded-lg p-6">
            <h3 className="text-xl text-primary mb-3">Mål & last · 2019 Double Cab</h3>
            <ul className="space-y-1.5 text-sm text-foreground/85">
              <Li>Lengde: <strong>5 362 mm</strong></Li>
              <Li>Bredde: <strong>1 860 mm</strong> (uten speil · 2 163 m/speil)</Li>
              <Li>Høyde: <strong>1 848 mm</strong></Li>
              <Li>Akselavstand: <strong>3 220 mm</strong></Li>
              <Li>Lasteplan: <strong>1 549 × 1 560 mm</strong> (1 139 mm mellom hjulkasser)</Li>
              <Li>Nyttelast: <strong>≈ 1 015 kg</strong></Li>
              <Li>Hengervekt m/brems: <strong>3 500 kg</strong></Li>
              <Li>Totalvekt (GVM): <strong>3 270 kg</strong></Li>
            </ul>
          </article>
          <article className="panel rounded-lg p-6">
            <h3 className="text-xl text-primary mb-3">Forbruk & terreng</h3>
            <ul className="space-y-1.5 text-sm text-foreground/85">
              <Li>Forbruk WLTP: <strong>≈ 8,9 l/100 km</strong> (blandet)</Li>
              <Li>CO₂-utslipp: <strong>≈ 232 g/km</strong></Li>
              <Li>Tankvolum: <strong>80 liter</strong> diesel</Li>
              <Li>AdBlue-tank: <strong>21 liter</strong> (SCR Euro 6d-Temp)</Li>
              <Li>Vadedybde: <strong>800 mm</strong></Li>
              <Li>Påkjøringsvinkel: <strong>29°</strong> · avgang <strong>21°</strong></Li>
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
