import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import westerosHero from "@/assets/got-westeros-hero.jpg";
import {
  Crown,
  Star,
  Tv,
  Film,
  Calendar,
  Users,
  Award,
  Flame,
  Snowflake,
  Sword,
  ChevronRight,
  X,
  Filter,
  Trophy,
  PlayCircle,
  Hourglass,
  CheckCircle2,
} from "lucide-react";

type FilterKey = "alle" | "pågår" | "kommende" | "ferdig";

const FILTERS: { key: FilterKey; label: string; icon: typeof Filter; hint: string }[] = [
  { key: "alle", label: "Alle kapitler", icon: Filter, hint: "Vis alt" },
  { key: "pågår", label: "Pågår nå", icon: PlayCircle, hint: "Serier som ruller" },
  { key: "kommende", label: "Hva kommer", icon: Hourglass, hint: "Annonsert / i utvikling" },
  { key: "ferdig", label: "Hvor gikk", icon: CheckCircle2, hint: "Avsluttet" },
];

export const Route = createFileRoute("/got-saga")({
  head: () => ({
    meta: [
      { title: "Sagaen om Westeros — Game of Thrones-krøniken" },
      {
        name: "description",
        content:
          "Komplett oversikt over alle Game of Thrones og House of the Dragon-serier og kommende filmer. IMDB-score, seertall, streaming og statistikk.",
      },
      { property: "og:title", content: "Sagaen om Westeros — Game of Thrones-krøniken" },
      {
        property: "og:description",
        content:
          "Alle serier, filmer og kommende kapitler i Westeros-sagaen. Med IMDB-score, seertall og statistikk.",
      },
      { property: "og:image", content: "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=1200" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Sagaen om Westeros" },
      {
        name: "twitter:description",
        content: "Den fullstendige krøniken om Westeros — serier, filmer og statistikk.",
      },
    ],
  }),
  component: GotSagaPage,
});

type SagaItem = {
  id: string;
  title: string;
  type: "serie" | "film" | "kommende";
  year: string;
  status: "Ferdig" | "Pågår" | "Kommende" | "Utvikling";
  imdb: number | null;
  rottenTomatoes: number | null;
  episodes?: number;
  seasons?: number;
  runtime?: string;
  streaming: string[];
  viewersMillions?: number; // peak viewers per ep
  totalViewers?: string;
  emmys?: number;
  budget?: string;
  image: string;
  tagline: string;
  description: string;
  cast: string[];
  trivia: string[];
};

const SAGA: SagaItem[] = [
  {
    id: "got",
    title: "Game of Thrones",
    type: "serie",
    year: "2011–2019",
    status: "Ferdig",
    imdb: 9.2,
    rottenTomatoes: 89,
    seasons: 8,
    episodes: 73,
    runtime: "55–82 min",
    streaming: ["HBO Max", "Sky", "NRK TV (utvalg)"],
    viewersMillions: 19.3,
    totalViewers: "~46 mill (finalen, alle plattformer)",
    emmys: 59,
    budget: "$15 mill / episode (S8)",
    image:
      "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=1600&q=80&auto=format&fit=crop",
    tagline: "Når du leker spillet om troner, vinner du eller dør.",
    description:
      "Den episke serien som startet det hele. Basert på George R.R. Martins romanserie A Song of Ice and Fire. Følger maktkampen mellom de store husene i Westeros mens en eldgammel trussel våkner i nord. Gjennom 8 sesonger ble det den mest sette HBO-serien noensinne, med rekordhøye seertall og 59 Emmy-priser — flest noensinne for en dramaserie.",
    cast: [
      "Peter Dinklage (Tyrion Lannister)",
      "Lena Headey (Cersei Lannister)",
      "Emilia Clarke (Daenerys Targaryen)",
      "Kit Harington (Jon Snow)",
      "Sophie Turner (Sansa Stark)",
      "Maisie Williams (Arya Stark)",
    ],
    trivia: [
      "Pilotepisoden ble spilt inn på nytt — nesten alt ble byttet ut",
      "Serien brukte ekte ulver (northern inuits) som direwolves",
      "Den siste sesongen kostet over 90 millioner dollar å produsere",
      "Hardhome-slaget (S5E8) regnes som en av TV-historiens beste actionscener",
    ],
  },
  {
    id: "hotd",
    title: "House of the Dragon",
    type: "serie",
    year: "2022–nå",
    status: "Pågår",
    imdb: 8.4,
    rottenTomatoes: 93,
    seasons: 2,
    episodes: 18,
    runtime: "60–80 min",
    streaming: ["HBO Max", "Sky"],
    viewersMillions: 10.2,
    totalViewers: "~30 mill (premiere S1, alle plattformer)",
    emmys: 9,
    budget: "$20 mill / episode",
    image:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1600&q=80&auto=format&fit=crop",
    tagline: "Drømmer gjorde oss konger. Drager gjorde oss guder.",
    description:
      "Prequel til Game of Thrones, satt 200 år tidligere. Basert på George R.R. Martins bok Fire & Blood. Skildrer huset Targaryens høyde og fallet — borgerkrigen kjent som «Dansen med drager». Serien har gjenoppvekket franchisen med rekordhøy premiere på HBO Max.",
    cast: [
      "Paddy Considine (Viserys I)",
      "Matt Smith (Daemon Targaryen)",
      "Emma D'Arcy (Rhaenyra Targaryen)",
      "Olivia Cooke (Alicent Hightower)",
      "Rhys Ifans (Otto Hightower)",
    ],
    trivia: [
      "Premieren var HBOs største noensinne med 9.99 mill seere første kveld",
      "Sesong 1 brukte 17 forskjellige drager",
      "Sesong 3 og 4 er allerede bestilt",
      "Hver drage har egen koreograf og «skuespiller» for bevegelsesfangst",
    ],
  },
  {
    id: "knight",
    title: "A Knight of the Seven Kingdoms",
    type: "kommende",
    year: "2026",
    status: "Kommende",
    imdb: null,
    rottenTomatoes: null,
    seasons: 1,
    episodes: 6,
    runtime: "ca 60 min",
    streaming: ["HBO Max"],
    viewersMillions: undefined,
    totalViewers: "Ikke utgitt",
    budget: "Ukjent",
    image:
      "https://images.unsplash.com/photo-1518709594023-6eab9bab7b23?w=1600&q=80&auto=format&fit=crop",
    tagline: "En ridder. En væpner. Et eventyr.",
    description:
      "Basert på George R.R. Martins novellesamling «Tales of Dunk and Egg». Følger den unge ridderen Ser Duncan the Tall og hans lille væpner Egg (den fremtidige kong Aegon V Targaryen) gjennom Westeros, ca. 90 år før hovedserien. Lettere tone, mer eventyrpreget enn forgjengerne.",
    cast: ["Peter Claffey (Dunk)", "Dexter Sol Ansell (Egg)", "Finn Bennett", "Bertie Carvel"],
    trivia: [
      "Premiere planlagt januar 2026 på HBO Max",
      "George R.R. Martin er executive producer",
      "Første sesong dekker novellen «The Hedge Knight»",
      "Tonen beskrives som mer eventyr og mindre politikk",
    ],
  },
  {
    id: "aegon",
    title: "Aegon's Conquest (arbeidstittel)",
    type: "kommende",
    year: "2027+",
    status: "Utvikling",
    imdb: null,
    rottenTomatoes: null,
    streaming: ["HBO Max"],
    viewersMillions: undefined,
    totalViewers: "Ikke utgitt",
    budget: "Ukjent",
    image:
      "https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?w=1600&q=80&auto=format&fit=crop",
    tagline: "Tre drager. Syv kongedømmer. Én erobrer.",
    description:
      "Planlagt prequel-serie om Aegon Targaryen den Erobreren — mannen som med søstrene Visenya og Rhaenys og deres tre drager forente de syv kongedømmene 300 år før Game of Thrones. Fortsatt i tidlig utvikling hos HBO.",
    cast: ["Casting ikke offentliggjort"],
    trivia: [
      "Bekreftet i utvikling av HBO i 2024",
      "Vil dekke Aegons erobring av Westeros",
      "Forventet å introdusere de berømte sverdene Blackfyre og Dark Sister",
    ],
  },
  {
    id: "ninevoyages",
    title: "Nine Voyages",
    type: "kommende",
    year: "TBA",
    status: "Utvikling",
    imdb: null,
    rottenTomatoes: null,
    streaming: ["HBO Max"],
    totalViewers: "Ikke utgitt",
    image:
      "https://images.unsplash.com/photo-1564594985645-4427056e22e2?w=1600&q=80&auto=format&fit=crop",
    tagline: "Havet kjenner ingen konger.",
    description:
      "Live-action serie om Lord Corlys Velaryon, «Sea Snake», og hans ni legendariske sjøreiser til de fjerneste hjørnene av kjente verden. Skulle opprinnelig vært animasjon, men er nå planlagt som live-action.",
    cast: ["Steve Toussaint forventes å reprise rollen som Corlys"],
    trivia: [
      "Ble opprinnelig annonsert som animasjonsserie",
      "Overgang til live-action bekreftet i 2024",
      "Vil utforske Essos, Asshai og fjerne østen",
    ],
  },
  {
    id: "snow",
    title: "Snow (kansellert)",
    type: "kommende",
    year: "Lagt på is",
    status: "Utvikling",
    imdb: null,
    rottenTomatoes: null,
    streaming: ["HBO Max"],
    totalViewers: "Ikke utgitt",
    image:
      "https://images.unsplash.com/photo-1551524559-8af4e6624178?w=1600&q=80&auto=format&fit=crop",
    tagline: "Kongen i nord vender hjem.",
    description:
      "Planlagt sequel-serie sentrert rundt Jon Snow etter hendelsene i Game of Thrones. Kit Harington var involvert i utviklingen, men prosjektet ble lagt på is i 2024. Kan fortsatt komme tilbake i en eller annen form.",
    cast: ["Kit Harington (planlagt) som Jon Snow"],
    trivia: [
      "Ble bekreftet av Kit Harington selv i 2022",
      "Lagt på pause i 2024 da man ikke fant riktig manus",
      "George R.R. Martin har sagt det fortsatt kan skje",
    ],
  },
];

const KEY_STATS = [
  {
    label: "Totalt episoder (alle serier)",
    value: "91",
    icon: Tv,
    detail: "73 GoT + 18 HotD",
  },
  {
    label: "Emmy Awards",
    value: "68",
    icon: Award,
    detail: "59 GoT + 9 HotD — rekord",
  },
  {
    label: "Toppseere én episode",
    value: "19,3M",
    icon: Users,
    detail: "GoT finalen, USA, 19. mai 2019",
  },
  {
    label: "Snitt IMDB-score",
    value: "8,8",
    icon: Star,
    detail: "Veid på tvers av sesonger",
  },
  {
    label: "Land serien sees i",
    value: "207",
    icon: Crown,
    detail: "Mest globalt distribuerte HBO-serie",
  },
  {
    label: "Produksjonsbudsjett S8",
    value: "$90M",
    icon: Flame,
    detail: "Siste sesong av GoT",
  },
];

// Sesong-by-sesong IMDB-score (offentlige tall)
const SEASON_SCORES = [
  { name: "GoT S1", score: 9.1, viewers: 2.5, color: "var(--color-primary)" },
  { name: "GoT S2", score: 9.2, viewers: 3.8, color: "var(--color-primary)" },
  { name: "GoT S3", score: 9.4, viewers: 4.4, color: "var(--color-primary)" },
  { name: "GoT S4", score: 9.4, viewers: 6.8, color: "var(--color-primary)" },
  { name: "GoT S5", score: 9.0, viewers: 6.9, color: "var(--color-primary)" },
  { name: "GoT S6", score: 9.4, viewers: 7.7, color: "var(--color-primary)" },
  { name: "GoT S7", score: 9.2, viewers: 10.3, color: "var(--color-primary)" },
  { name: "GoT S8", score: 6.0, viewers: 13.6, color: "oklch(0.55 0.20 25)" },
  { name: "HotD S1", score: 8.5, viewers: 9.99, color: "var(--gold)" },
  { name: "HotD S2", score: 8.2, viewers: 7.8, color: "var(--gold)" },
];

const STREAMING_GUIDE = [
  {
    name: "HBO Max",
    flag: "🇳🇴",
    available: "Ja, i Norge",
    price: "Fra 99 kr/mnd",
    note: "Hovedhjemmet — alle serier og kommende prosjekter",
  },
  {
    name: "Sky / NOW",
    flag: "🇬🇧",
    available: "Storbritannia",
    price: "£9.99/mnd",
    note: "Eksklusiv distributør i UK",
  },
  {
    name: "NRK TV",
    flag: "🇳🇴",
    available: "Tidvis utvalgte sesonger",
    price: "Gratis",
    note: "GoT har vært tilgjengelig i perioder",
  },
];

function GotSagaPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("alle");
  const open = useMemo(() => SAGA.find((s) => s.id === openId) ?? null, [openId]);

  const filteredSaga = useMemo(() => {
    if (filter === "alle") return SAGA;
    if (filter === "pågår") return SAGA.filter((s) => s.status === "Pågår");
    if (filter === "kommende")
      return SAGA.filter((s) => s.status === "Kommende" || s.status === "Utvikling");
    return SAGA.filter((s) => s.status === "Ferdig");
  }, [filter]);

  const counts = useMemo(
    () => ({
      alle: SAGA.length,
      pågår: SAGA.filter((s) => s.status === "Pågår").length,
      kommende: SAGA.filter((s) => s.status === "Kommende" || s.status === "Utvikling").length,
      ferdig: SAGA.filter((s) => s.status === "Ferdig").length,
    }),
    [],
  );

  // Top 5 IMDB — basert på sesong-scorer
  const topSeasons = useMemo(
    () => [...SEASON_SCORES].sort((a, b) => b.score - a.score).slice(0, 5),
    [],
  );

  // Top 5 GoT-relaterte spin-off / tilleggsserier (ikke hovedseriene)
  const TOP_RELATED: {
    title: string;
    year: string;
    score: number;
    type: string;
    cost: string;
    popularity: string;
    streaming: string[];
    description: string;
  }[] = [
    {
      title: "Game of Thrones: Conquest & Rebellion",
      year: "2017",
      score: 7.7,
      type: "Animert spesial",
      cost: "~$1–2 mill",
      popularity: "Bonusmateriale på Blu-ray S7 — kultstatus blant fans",
      streaming: ["HBO Max", "Blu-ray S7"],
      description:
        "45 minutters animert kortfilm fortalt av GoT-skuespillere (Harry Lloyd, Nikolaj Coster-Waldau m.fl.) som dramatiserer Aegon Targaryens erobring av Westeros 300 år før hovedserien.",
    },
    {
      title: "Game of Thrones: Histories & Lore",
      year: "2012–2019",
      score: 8.9,
      type: "Animert sidekrønike",
      cost: "Ukjent (lavbudsjett)",
      popularity: "Hyllet av fans — ofte kalt «den beste delen av Blu-ray-pakkene»",
      streaming: ["HBO Max", "Blu-ray-utgaver"],
      description:
        "Kortfilmserie i animert form som fyller ut Westeros-historien. Fortalt av karakterer fra serien, dekker alt fra Aegons erobring til Robert's Rebellion. Over 70 episoder fordelt på 8 sesonger.",
    },
    {
      title: "Game of Thrones: The Last Watch",
      year: "2019",
      score: 8.0,
      type: "Dokumentar",
      cost: "~$3 mill",
      popularity: "1,4 mill seere premiere — hjertevarmende blikk bak kulissene",
      streaming: ["HBO Max"],
      description:
        "To timer lang dokumentar av Jeanie Finlay som følger produksjonen av sesong 8. Mer fokus på crew enn stjerner — gir et rørende bilde av hvor mye arbeid som gikk inn i finalen.",
    },
    {
      title: "Thronecast",
      year: "2011–2019",
      score: 7.2,
      type: "Etter-show / talkshow",
      cost: "~£500k/sesong",
      popularity: "Sky Atlantic UK — fast følge for hardcore fans",
      streaming: ["Sky / NOW (UK)"],
      description:
        "Britisk etter-show som ble sendt etter hver GoT-episode. Sue Perkins og Jamie East intervjuet skuespillere og analyserte handlingen ferskt. Avsluttet med GoT-finalen.",
    },
    {
      title: "After the Thrones",
      year: "2016",
      score: 7.5,
      type: "Etter-show / analyse",
      cost: "~$2 mill",
      popularity: "Andrew Rector og Chris Ryan — Bill Simmons-produksjon",
      streaming: ["HBO Max"],
      description:
        "Amerikansk etter-show kun for sesong 6. Dypanalyse av hver episode med teorier og kontekst — fikk én sesong før HBO valgte å satse på sosiale medier i stedet.",
    },
  ];

  const [openRelated, setOpenRelated] = useState<string | null>(null);


  return (
    <PageShell>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        <img
          src={westerosHero}
          alt="Westeros — kontinentet fra Game of Thrones"
          className="absolute inset-0 w-full h-full object-cover opacity-60"
          loading="eager"
          width={1920}
          height={1080}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, oklch(0.08 0.02 30 / 0.55) 0%, oklch(0.06 0.01 240 / 0.75) 100%)",
          }}
        />
        <div className="relative container mx-auto px-4 py-16 md:py-24 text-center">
          <div className="ornate-divider mb-6 max-w-md mx-auto">
            <span className="text-medieval text-xs tracking-[0.4em]">FIRE & BLOD</span>
          </div>
          <h1 className="heading-hero text-4xl md:text-6xl lg:text-7xl mb-4">
            Sagaen om Westeros
          </h1>
          <p className="text-medieval text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-2">
            «Når du leker spillet om troner, vinner du eller dør.»
          </p>
          <p className="text-sm text-muted-foreground/80 max-w-2xl mx-auto">
            Den fullstendige krøniken — alle serier, kommende kapitler, IMDB-poeng,
            seertall og hvor du finner dem.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-sm border border-primary/40 bg-primary/10 text-primary tracking-widest uppercase flex items-center gap-1.5">
              <Snowflake size={12} /> Vinteren kom
            </span>
            <span className="px-3 py-1.5 rounded-sm border border-destructive/40 bg-destructive/10 text-destructive tracking-widest uppercase flex items-center gap-1.5">
              <Flame size={12} /> Drager fløy
            </span>
            <span className="px-3 py-1.5 rounded-sm border border-gold/40 bg-gold/10 text-gold tracking-widest uppercase flex items-center gap-1.5">
              <Crown size={12} /> Troner falt
            </span>
          </div>
        </div>
      </section>

      {/* KEY STATS */}
      <section className="container mx-auto px-4 py-12">
        <h2 className="text-display text-2xl md:text-3xl text-primary text-center mb-2 tracking-widest">
          KRØNIKENS TALL
        </h2>
        <p className="text-center text-muted-foreground text-sm mb-8">
          De harde fakta fra ravnenes regnskap
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {KEY_STATS.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="panel p-4 rounded-sm text-center glow-on-hover">
                <Icon className="mx-auto text-primary mb-2" size={20} />
                <div className="text-display text-2xl text-foreground">{s.value}</div>
                <div className="text-[10px] tracking-widest uppercase text-primary mt-1">
                  {s.label}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1.5">{s.detail}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* IMDB CHART */}
      <section className="container mx-auto px-4 py-12 border-t border-border">
        <h2 className="text-display text-2xl md:text-3xl text-primary text-center mb-2 tracking-widest">
          DOMMEN FRA FOLKET
        </h2>
        <p className="text-center text-muted-foreground text-sm mb-8">
          IMDB-score og seertall (millioner) per sesong
        </p>
        <div className="panel p-4 md:p-6 rounded-sm">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={SEASON_SCORES} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="name"
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                stroke="var(--color-border)"
              />
              <YAxis
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                stroke="var(--color-border)"
                domain={[0, 10]}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  fontSize: 12,
                }}
                formatter={(v: number, n: string) =>
                  n === "score" ? [`${v} / 10`, "IMDB"] : [`${v}M`, "Seere"]
                }
              />
              <Bar dataKey="score" radius={[2, 2, 0, 0]}>
                {SEASON_SCORES.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 text-xs text-muted-foreground text-center">
            <span className="text-primary">●</span> Game of Thrones &nbsp;
            <span style={{ color: "var(--gold)" }}>●</span> House of the Dragon &nbsp;
            <span style={{ color: "oklch(0.55 0.20 25)" }}>●</span> Mest omdiskutert
          </div>
        </div>
      </section>

      {/* TOP 5 LISTER */}
      <section className="container mx-auto px-4 py-12 border-t border-border">
        <h2 className="text-display text-2xl md:text-3xl text-primary text-center mb-2 tracking-widest">
          MAESTERENS TOPPLISTER
        </h2>
        <p className="text-center text-muted-foreground text-sm mb-8">
          De fem beste — fra sesongene og fra det store lerretet
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Top 5 sesonger */}
          <div className="panel rounded-sm p-5">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
              <Trophy className="text-gold" size={18} />
              <h3 className="text-display text-lg text-primary tracking-wider">
                TOP 5 SESONGER (IMDB)
              </h3>
            </div>
            <ol className="space-y-2.5">
              {topSeasons.map((s, i) => (
                <li
                  key={s.name}
                  className="flex items-center gap-3 p-2.5 rounded-sm bg-secondary/40 border border-border/60"
                >
                  <span className="text-display text-2xl text-gold w-7 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-foreground font-medium">{s.name}</div>
                    <div className="text-[10px] tracking-widest uppercase text-muted-foreground">
                      Topp {s.viewers}M seere/ep
                    </div>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 rounded-sm bg-background/80 border border-border">
                    <Star size={11} className="text-gold fill-gold" />
                    <span className="text-sm font-semibold text-foreground">{s.score}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Top 5 GoT-relaterte tilleggsserier */}
          <div className="panel rounded-sm p-5">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
              <Tv className="text-primary" size={18} />
              <h3 className="text-display text-lg text-primary tracking-wider">
                TOP 5 GOT-RELATERTE SERIER
              </h3>
            </div>
            <ol className="space-y-2">
              {[...TOP_RELATED]
                .sort((a, b) => b.score - a.score)
                .map((r, i) => {
                  const isOpen = openRelated === r.title;
                  return (
                    <li
                      key={r.title}
                      className="rounded-sm bg-secondary/40 border border-border/60 overflow-hidden"
                    >
                      <button
                        onClick={() => setOpenRelated(isOpen ? null : r.title)}
                        className="w-full flex items-center gap-3 p-2.5 text-left hover:bg-secondary/70 transition-colors"
                      >
                        <span className="text-display text-2xl text-primary w-7 text-center">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-foreground font-medium truncate">
                            {r.title}
                          </div>
                          <div className="text-[10px] tracking-widest uppercase text-muted-foreground">
                            {r.year} · {r.type}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 px-2 py-1 rounded-sm bg-background/80 border border-border">
                          <Star size={11} className="text-gold fill-gold" />
                          <span className="text-sm font-semibold text-foreground">{r.score}</span>
                        </div>
                        <ChevronRight
                          size={14}
                          className={`text-muted-foreground transition-transform ${
                            isOpen ? "rotate-90" : ""
                          }`}
                        />
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4 pt-1 border-t border-border/60 space-y-3 bg-background/40">
                          <p className="text-xs text-foreground/85 leading-relaxed">
                            {r.description}
                          </p>
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div className="bg-secondary/50 rounded-sm p-2 border border-border/60">
                              <div className="flex items-center gap-1 text-[9px] tracking-widest uppercase text-primary mb-0.5">
                                <Star size={10} className="text-gold fill-gold" /> IMDB
                              </div>
                              <div className="text-sm font-semibold text-foreground">
                                {r.score} / 10
                              </div>
                            </div>
                            <div className="bg-secondary/50 rounded-sm p-2 border border-border/60">
                              <div className="flex items-center gap-1 text-[9px] tracking-widest uppercase text-primary mb-0.5">
                                <Flame size={10} /> Kostnad
                              </div>
                              <div className="text-sm font-semibold text-foreground">
                                {r.cost}
                              </div>
                            </div>
                            <div className="col-span-2 bg-secondary/50 rounded-sm p-2 border border-border/60">
                              <div className="flex items-center gap-1 text-[9px] tracking-widest uppercase text-primary mb-0.5">
                                <Users size={10} /> Popularitet
                              </div>
                              <div className="text-xs text-foreground/85">{r.popularity}</div>
                            </div>
                          </div>
                          <div>
                            <div className="text-[9px] tracking-widest uppercase text-primary mb-1.5">
                              Hvor du kan se den
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {r.streaming.map((s) => (
                                <span
                                  key={s}
                                  className="px-2 py-1 rounded-sm bg-primary/10 border border-primary/40 text-primary text-[10px]"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
            </ol>
            <p className="text-[10px] text-muted-foreground italic mt-3">
              Spin-off, dokumentarer og animerte tilleggsserier fra Westeros-universet.
            </p>
          </div>
        </div>
      </section>


      {/* SAGA LIST */}
      <section className="container mx-auto px-4 py-12 border-t border-border">
        <h2 className="text-display text-2xl md:text-3xl text-primary text-center mb-2 tracking-widest">
          KAPITLENE I SAGAEN
        </h2>
        <p className="text-center text-muted-foreground text-sm mb-6">
          Klikk for å åpne kongelig dossier — fra det som var, til det som kommer
        </p>

        {/* FILTER BAR */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
          {FILTERS.map((f) => {
            const Icon = f.icon;
            const active = filter === f.key;
            const count = counts[f.key];
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                title={f.hint}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-sm border text-xs tracking-widest uppercase transition-all ${
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-[0_0_15px_var(--color-primary)]"
                    : "bg-secondary/30 text-muted-foreground border-border hover:text-primary hover:border-primary/60"
                }`}
              >
                <Icon size={13} />
                <span>{f.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-sm ${
                    active ? "bg-primary-foreground/20" : "bg-background/60"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSaga.length === 0 ? (
            <div className="col-span-full text-center text-muted-foreground italic py-10">
              Ingen kapitler funnet i dette filtret.
            </div>
          ) : (
            filteredSaga.map((item) => (
            <button
              key={item.id}
              onClick={() => setOpenId(item.id)}
              className="group text-left panel rounded-sm overflow-hidden glow-on-hover flex flex-col"
            >
              <div
                className="h-44 bg-cover bg-center relative"
                style={{ backgroundImage: `url(${item.image})` }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(180deg, transparent 30%, oklch(0.10 0.01 240 / 0.95) 100%)",
                  }}
                />
                <div className="absolute top-3 left-3 flex gap-1.5">
                  {item.type === "serie" && (
                    <span className="text-[10px] tracking-widest uppercase bg-primary/90 text-primary-foreground px-2 py-0.5 rounded-sm flex items-center gap-1">
                      <Tv size={10} /> Serie
                    </span>
                  )}
                  {item.type === "film" && (
                    <span className="text-[10px] tracking-widest uppercase bg-gold/90 text-primary-foreground px-2 py-0.5 rounded-sm flex items-center gap-1">
                      <Film size={10} /> Film
                    </span>
                  )}
                  {item.type === "kommende" && (
                    <span className="text-[10px] tracking-widest uppercase bg-destructive/90 text-destructive-foreground px-2 py-0.5 rounded-sm flex items-center gap-1">
                      <Calendar size={10} /> {item.status}
                    </span>
                  )}
                </div>
                {item.imdb && (
                  <div className="absolute top-3 right-3 bg-background/80 backdrop-blur px-2 py-1 rounded-sm flex items-center gap-1 text-xs">
                    <Star size={11} className="text-gold fill-gold" />
                    <span className="text-foreground font-semibold">{item.imdb}</span>
                  </div>
                )}
                <div className="absolute bottom-3 left-3 right-3">
                  <div className="text-display text-lg text-foreground tracking-wide">
                    {item.title}
                  </div>
                  <div className="text-[10px] tracking-widest uppercase text-primary">
                    {item.year}
                  </div>
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <p className="text-medieval text-xs text-muted-foreground italic mb-2">
                  «{item.tagline}»
                </p>
                <p className="text-sm text-foreground/80 line-clamp-3 flex-1">
                  {item.description}
                </p>
                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[11px]">
                  <div className="flex flex-wrap gap-1">
                    {item.streaming.slice(0, 2).map((s) => (
                      <span
                        key={s}
                        className="px-1.5 py-0.5 rounded-sm bg-secondary text-secondary-foreground text-[10px]"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                  <span className="text-primary flex items-center gap-1 group-hover:gap-2 transition-all">
                    Les mer <ChevronRight size={12} />
                  </span>
                </div>
              </div>
            </button>
            ))
          )}
        </div>
      </section>

      {/* STREAMING GUIDE */}
      <section className="container mx-auto px-4 py-12 border-t border-border">
        <h2 className="text-display text-2xl md:text-3xl text-primary text-center mb-2 tracking-widest">
          HVOR SES SAGAEN
        </h2>
        <p className="text-center text-muted-foreground text-sm mb-8">
          Strømmetjenester som bærer krøniken
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STREAMING_GUIDE.map((s) => (
            <div key={s.name} className="panel p-5 rounded-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">{s.flag}</span>
                <h3 className="text-display text-lg text-primary tracking-wider">{s.name}</h3>
              </div>
              <div className="text-xs space-y-1.5">
                <div className="flex justify-between border-b border-border pb-1.5">
                  <span className="text-muted-foreground">Tilgjengelig</span>
                  <span className="text-foreground">{s.available}</span>
                </div>
                <div className="flex justify-between border-b border-border pb-1.5">
                  <span className="text-muted-foreground">Pris</span>
                  <span className="text-foreground">{s.price}</span>
                </div>
                <p className="text-[11px] text-muted-foreground italic mt-2">{s.note}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* TIMELINE / CONTEXT */}
      <section className="container mx-auto px-4 py-12 border-t border-border">
        <h2 className="text-display text-2xl md:text-3xl text-primary text-center mb-2 tracking-widest">
          KRONOLOGI I WESTEROS
        </h2>
        <p className="text-center text-muted-foreground text-sm mb-10">
          Når i historien hver serie utspiller seg
        </p>
        <div className="relative max-w-3xl mx-auto">
          <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-primary/0 via-primary/60 to-primary/0" />
          {[
            { year: "≈300 år før GoT", title: "Aegons Erobring", note: "Kommende serie" },
            { year: "≈200 år før GoT", title: "Dansen med drager", note: "House of the Dragon" },
            { year: "≈90 år før GoT", title: "Dunk & Egg-fortellingene", note: "A Knight of the Seven Kingdoms" },
            { year: "År 0", title: "Game of Thrones starter", note: "Ned Stark drar sørover" },
            { year: "År 8 (i serien)", title: "GoT-finalen", note: "Tronen smeltet" },
            { year: "Etter GoT", title: "Snow (på is)", note: "Jon Snow vender hjem" },
          ].map((t, i) => (
            <div
              key={i}
              className={`relative mb-6 md:mb-4 flex items-start gap-4 md:gap-0 ${
                i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
              }`}
            >
              <div className="absolute left-4 md:left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-primary border-2 border-background mt-1.5" />
              <div className={`md:w-1/2 pl-12 md:pl-0 ${i % 2 === 0 ? "md:pr-8 md:text-right" : "md:pl-8"}`}>
                <div className="text-[10px] tracking-widest uppercase text-primary">{t.year}</div>
                <div className="text-display text-base text-foreground">{t.title}</div>
                <div className="text-xs text-muted-foreground italic">{t.note}</div>
              </div>
              <div className="hidden md:block md:w-1/2" />
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER NOTE */}
      <section className="container mx-auto px-4 py-10 border-t border-border text-center">
        <p className="text-medieval text-sm text-muted-foreground italic">
          «En leser lever tusen liv før han dør. Mannen som aldri leser lever bare ett.»
        </p>
        <p className="text-[10px] tracking-widest uppercase text-primary mt-2">
          — George R.R. Martin
        </p>
      </section>

      {/* DOSSIER MODAL */}
      {open && (
        <div
          className="fixed inset-0 z-[100] bg-background/90 backdrop-blur-md overflow-y-auto"
          onClick={() => setOpenId(null)}
        >
          <div className="min-h-screen flex items-start md:items-center justify-center p-4">
            <div
              className="panel rounded-sm max-w-3xl w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="h-56 md:h-72 bg-cover bg-center relative"
                style={{ backgroundImage: `url(${open.image})` }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(180deg, transparent 20%, oklch(0.10 0.01 240 / 0.95) 100%)",
                  }}
                />
                <button
                  onClick={() => setOpenId(null)}
                  className="absolute top-3 right-3 w-9 h-9 rounded-sm bg-background/70 hover:bg-background border border-border flex items-center justify-center text-foreground"
                  aria-label="Lukk"
                >
                  <X size={18} />
                </button>
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="text-[10px] tracking-widest uppercase text-primary mb-1">
                    {open.year} · {open.status}
                  </div>
                  <h3 className="text-display text-2xl md:text-4xl text-foreground tracking-wide">
                    {open.title}
                  </h3>
                  <p className="text-medieval text-sm text-muted-foreground italic mt-1">
                    «{open.tagline}»
                  </p>
                </div>
              </div>

              <div className="p-5 md:p-7 space-y-5">
                {/* Quick stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                  {open.imdb !== null && (
                    <div className="bg-secondary/50 rounded-sm p-2.5 border border-border">
                      <Star size={14} className="mx-auto text-gold fill-gold mb-1" />
                      <div className="text-display text-lg text-foreground">{open.imdb}</div>
                      <div className="text-[9px] tracking-widest uppercase text-muted-foreground">
                        IMDB
                      </div>
                    </div>
                  )}
                  {open.rottenTomatoes !== null && (
                    <div className="bg-secondary/50 rounded-sm p-2.5 border border-border">
                      <Award size={14} className="mx-auto text-destructive mb-1" />
                      <div className="text-display text-lg text-foreground">
                        {open.rottenTomatoes}%
                      </div>
                      <div className="text-[9px] tracking-widest uppercase text-muted-foreground">
                        Rotten T.
                      </div>
                    </div>
                  )}
                  {open.episodes && (
                    <div className="bg-secondary/50 rounded-sm p-2.5 border border-border">
                      <Tv size={14} className="mx-auto text-primary mb-1" />
                      <div className="text-display text-lg text-foreground">{open.episodes}</div>
                      <div className="text-[9px] tracking-widest uppercase text-muted-foreground">
                        Episoder
                      </div>
                    </div>
                  )}
                  {open.viewersMillions && (
                    <div className="bg-secondary/50 rounded-sm p-2.5 border border-border">
                      <Users size={14} className="mx-auto text-ice mb-1" />
                      <div className="text-display text-lg text-foreground">
                        {open.viewersMillions}M
                      </div>
                      <div className="text-[9px] tracking-widest uppercase text-muted-foreground">
                        Topp/ep
                      </div>
                    </div>
                  )}
                </div>

                {/* Description */}
                <div>
                  <h4 className="text-display text-xs tracking-widest text-primary mb-2 flex items-center gap-1.5">
                    <Sword size={12} /> KRØNIKEN
                  </h4>
                  <p className="text-sm text-foreground/85 leading-relaxed">{open.description}</p>
                </div>

                {/* Cast */}
                <div>
                  <h4 className="text-display text-xs tracking-widest text-primary mb-2 flex items-center gap-1.5">
                    <Crown size={12} /> HUSETS MEDLEMMER
                  </h4>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs text-foreground/85">
                    {open.cast.map((c) => (
                      <li key={c} className="flex items-start gap-2">
                        <span className="text-primary mt-1">◆</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Trivia */}
                <div>
                  <h4 className="text-display text-xs tracking-widest text-primary mb-2 flex items-center gap-1.5">
                    <Flame size={12} /> RAVNERYKTER
                  </h4>
                  <ul className="space-y-1.5 text-xs text-foreground/85">
                    {open.trivia.map((t) => (
                      <li key={t} className="flex items-start gap-2">
                        <span className="text-gold mt-1">✦</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Streaming */}
                <div className="border-t border-border pt-4">
                  <h4 className="text-display text-xs tracking-widest text-primary mb-2">
                    SES PÅ
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {open.streaming.map((s) => (
                      <span
                        key={s}
                        className="px-3 py-1 rounded-sm bg-primary/10 border border-primary/40 text-primary text-xs"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                  {open.budget && (
                    <p className="text-[11px] text-muted-foreground mt-3">
                      <span className="text-primary">Budsjett:</span> {open.budget}
                    </p>
                  )}
                  {open.totalViewers && (
                    <p className="text-[11px] text-muted-foreground">
                      <span className="text-primary">Total seermasse:</span> {open.totalViewers}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
