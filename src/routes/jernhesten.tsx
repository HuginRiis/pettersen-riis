import { createFileRoute } from "@tanstack/react-router";
import {
  Battery,
  Zap,
  Gauge,
  Mountain,
  Wind,
  Snowflake,
  Cog,
  Ruler,
  Award,
  Crown,
  Shield,
  Sparkles,
  Plug,
  Timer,
} from "lucide-react";
import { PageShell, PageHero } from "@/components/PageShell";
import jernhestenImg from "@/assets/jernhesten.jpg";
import jernhestenLading from "@/assets/jernhesten-lading.jpg";
import jernhestenSkog from "@/assets/jernhesten-skog.jpg";
import jernhestenFrontLading from "@/assets/jernhesten-front-lading.jpg";
import jernhestenBak from "@/assets/jernhesten-bak.jpg";
import jernhestenByen from "@/assets/jernhesten-byen.jpg";

export const Route = createFileRoute("/jernhesten")({
  head: () => ({
    meta: [
      { title: "Jernhesten — Jaguar I-Pace | House Pettersen Riis" },
      {
        name: "description",
        content:
          "Krøniken om Jernhesten — Jaguar I-Pace. Spesifikasjoner, rekkevidde, ladning og alt som rir borgens elektriske ganger.",
      },
      { property: "og:title", content: "Jernhesten — Jaguar I-Pace" },
      {
        property: "og:description",
        content:
          "Borgens elektriske ganger — full krønike om Jaguar I-Pace med spesifikasjoner, ytelser og praktisk visdom.",
      },
      { property: "og:image", content: jernhestenImg },
      { property: "twitter:image", content: jernhestenImg },
    ],
  }),
  component: JernhestenPage,
});

function JernhestenPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Borgens elektriske ganger"
        title="Jernhesten"
        subtitle="Jaguar I-Pace — den lydløse løven av Coventry. En ganger uten havre, født av lyn og smidd av britiske mestre."
        image={jernhestenImg}
      />

      <section className="container mx-auto px-4 py-12 max-w-6xl space-y-12">
        {/* Krønikens åpning */}
        <article className="panel rounded-lg p-6 md:p-8">
          <h2 className="text-2xl text-primary mb-3 flex items-center gap-2">
            <Crown size={22} /> Krønikens åpning
          </h2>
          <p className="text-foreground/85 leading-relaxed mb-3">
            I året 2018 trådte Jaguar I-Pace frem fra smiene i Graz og ble den
            første store britiske elektriske gangeren — den første utfordrer mot
            de tyske jarlene og den vestligste rivalen til Tesla. Den vant
            «World Car of the Year», «World Green Car» og «World Car Design of
            the Year» samme år, en bragd ingen før hadde gjort.
          </p>
          <p className="text-foreground/85 leading-relaxed">
            Jernhesten i borgens stall er av denne ætten — to elektriske motorer,
            firehjulsdrift, og en kraft som rivaliserer eldgamle drager. Den
            beveger seg uten lyd, men når den løper, hører fjellet det.
          </p>
        </article>

        {/* Spesifikasjoner */}
        <section>
          <h2 className="text-2xl text-primary mb-5 flex items-center gap-2">
            <Award size={22} /> Gangerens segl
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Spec icon={Battery} label="Batteri" value="90 kWh" sub="Litiumion, 432 celler" />
            <Spec icon={Mountain} label="Rekkevidde" value="≈ 470 km" sub="WLTP-syklus" />
            <Spec icon={Zap} label="Effekt" value="400 hk" sub="294 kW total" />
            <Spec icon={Gauge} label="0–100 km/t" value="4,8 sek" sub="Som en pil" />
            <Spec icon={Wind} label="Toppfart" value="200 km/t" sub="Begrenset" />
            <Spec icon={Cog} label="Drev" value="AWD" sub="To motorer, én foran én bak" />
            <Spec icon={Ruler} label="Lengde" value="4 682 mm" sub="Bredde 2 011 mm" />
            <Spec icon={Shield} label="Vekt" value="2 133 kg" sub="Tung som et beltedyr" />
          </div>
        </section>

        {/* Ladning */}
        <section className="grid md:grid-cols-2 gap-6 items-stretch">
          <div className="panel rounded-lg overflow-hidden">
            <img
              src={jernhestenLading}
              alt="Jernhesten lader ved en norsk ladestasjon i vintermørket"
              className="w-full h-64 md:h-full object-cover"
              loading="lazy"
              width={1280}
              height={1024}
            />
          </div>
          <article className="panel rounded-lg p-6">
            <h2 className="text-2xl text-primary mb-4 flex items-center gap-2">
              <Plug size={20} /> Hvordan gangeren mettes
            </h2>
            <ul className="space-y-3 text-sm text-foreground/85">
              <Row icon={Zap} title="Hurtiglading (DC)">
                Opptil <span className="text-primary">100 kW</span> via CCS — fra
                0 til 80 % på ca. <span className="text-primary">40 minutter</span>.
              </Row>
              <Row icon={Plug} title="Hjemmelading (AC)">
                Inntil <span className="text-primary">11 kW</span> trefase — full
                ladning på en natt (ca. 8–10 t).
              </Row>
              <Row icon={Timer} title="Nødladning">
                Vanlig stikkontakt 2,3 kW — hele døgnet for 100 % full tank.
              </Row>
              <Row icon={Snowflake} title="Vinterens pris">
                Norsk frost reduserer rekkevidden med
                <span className="text-primary"> 20–30 %</span>. Forhåndsvarm
                gjerne batteriet før hurtiglading.
              </Row>
            </ul>
          </article>
        </section>

        {/* Funksjoner */}
        <section>
          <h2 className="text-2xl text-primary mb-5 flex items-center gap-2">
            <Sparkles size={22} /> Borgens utstyr
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            <Card title="Luftfjæring">
              Adaptiv luftfjæring som hever karosseriet 50 mm i terreng — egnet
              for grusveier til hytta og snørike vintre.
            </Card>
            <Card title="Pivi Pro / Touch Pro Duo">
              To skjermer i konsollen styrer alt fra navigasjon til klima. OTA-
              oppdateringer holder borgen à jour.
            </Card>
            <Card title="Meridian lydanlegg">
              Opptil 825 W gjennom 16 høyttalere — perfekt for The Rains of
              Castamere på lange ferder.
            </Card>
            <Card title="Panoramaglass-tak">
              Fast glasstak med UV-filter — stjernehimmel over Vesterlandet på
              klare netter.
            </Card>
            <Card title="Adaptiv cruise & spor">
              Holder avstand og spor på motorvei — nyttig på den lange marsj
              mellom Skien og hytta.
            </Card>
            <Card title="Varmepumpe">
              Gjenvinner varme fra motorer og batteri — sparer rekkevidde i
              vinterens grep.</Card>
          </div>
        </section>

        {/* Praktisk */}
        <section className="grid md:grid-cols-2 gap-4">
          <article className="panel rounded-lg p-6">
            <h3 className="text-xl text-primary mb-3">Mål & rom</h3>
            <ul className="space-y-1.5 text-sm text-foreground/85">
              <Li>Bagasjerom: <strong>656 liter</strong> bak (1 453 l m/sete nede)</Li>
              <Li>Frunk: <strong>27 liter</strong> under panseret</Li>
              <Li>Akselavstand: <strong>2 990 mm</strong></Li>
              <Li>Bakkeklaring: <strong>174 mm</strong> (opp til 224 mm i terreng)</Li>
              <Li>Vadedybde: <strong>500 mm</strong></Li>
              <Li>Hengervekt: <strong>750 kg</strong></Li>
            </ul>
          </article>
          <article className="panel rounded-lg p-6">
            <h3 className="text-xl text-primary mb-3">Forbruk & varme</h3>
            <ul className="space-y-1.5 text-sm text-foreground/85">
              <Li>Forbruk WLTP: <strong>≈ 23 kWh/100 km</strong></Li>
              <Li>Norsk vinter: <strong>27–32 kWh/100 km</strong></Li>
              <Li>Forhåndsvarming via app: ja (Remote)</Li>
              <Li>Setevarme & rattvarme: ja</Li>
              <Li>Garantitid batteri: <strong>8 år / 160 000 km</strong></Li>
              <Li>Service-intervall: <strong>2 år / 34 000 km</strong></Li>
            </ul>
          </article>
        </section>

        {/* Galleri — Gangerens portretter */}
        <section>
          <h2 className="text-2xl text-primary mb-5 flex items-center gap-2">
            <Crown size={22} /> Gangerens portretter
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Portrait
              src={jernhestenSkog}
              title="Vokteren av Vintervedet"
              caption="Jernhesten hviler ved skogkanten, der snøen ennå holder fjellets ord. Tre stille vakter står bak — en konge mellom ulvene."
            />
            <Portrait
              src={jernhestenFrontLading}
              title="Når gangeren drikker fra lynet"
              caption="Ved borgens egen kilde mettes Jernhesten med strøm fra Vesterlandets nett. En lydløs rite, gjentatt hver natt."
            />
            <Portrait
              src={jernhestenBak}
              title="EV400 — Hertugen av Coventry"
              caption="Fra hekkens skygge skuer den ut over forstaden. To motorer, fire hjul, og en hale av rødt lys som varsler avreise."
            />
            <Portrait
              src={jernhestenByen}
              title="Jernhesten i Skien-by"
              caption="Mellom borgerhus og torg står den parkert som en svart ridder — I-PACE preget i krom, Jaguarens hode lyser stille."
            />
          </div>
        </section>

        {/* Mesterens råd */}
        <article className="panel rounded-lg p-6 md:p-8 border-primary/30">
          <h2 className="text-2xl text-primary mb-3">Mesterens råd</h2>
          <p className="text-foreground/85 leading-relaxed mb-2">
            «Hold gangeren varm før den drikker fra hurtigkilden, og la den hvile
            mellom 20 og 80 prosent når den slumrer i borgen. Slik vil batteriet
            tjene huset i mange vintre.»
          </p>
          <p className="text-xs text-muted-foreground italic">
            — Mester Aemon av Coventry
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
  icon: typeof Battery;
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

function Row({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Plug;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <Icon size={16} className="text-primary flex-shrink-0 mt-0.5" />
      <div>
        <div className="text-foreground font-semibold mb-0.5">{title}</div>
        <div className="text-foreground/80">{children}</div>
      </div>
    </li>
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

function Portrait({
  src,
  title,
  caption,
}: {
  src: string;
  title: string;
  caption: string;
}) {
  return (
    <figure className="panel rounded-lg overflow-hidden glow-on-hover">
      <div className="aspect-[4/3] overflow-hidden">
        <img
          src={src}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
          loading="lazy"
        />
      </div>
      <figcaption className="p-4">
        <h3 className="text-primary text-lg mb-1 text-display tracking-wide">
          {title}
        </h3>
        <p className="text-sm text-foreground/80 leading-relaxed">{caption}</p>
      </figcaption>
    </figure>
  );
}
