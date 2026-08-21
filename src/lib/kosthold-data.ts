// Kunnskapsbase for kosthold-siden – næringsplansjer (protein, fett, karbo, fiber),
// ukeplaner for vektnedgang / muskelvekst og laktosefri guide (Nora).

export const PERSONS = ["Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"] as const;
export type Person = (typeof PERSONS)[number];

export const LACTOSE_PERSON = "Nora";

export const MEAL_TYPES = ["Frokost", "Lunsj", "Snack", "Middag", "Kveld", "Drikke"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export type SourceItem = { name: string; portion: string; value: number };

export const SOURCE_GROUPS: {
  key: string;
  label: string;
  unit: string;
  blurb: string;
  items: SourceItem[];
}[] = [
  {
    key: "protein",
    label: "Protein",
    unit: "g",
    blurb: "Bygg · Reparer · Styrk",
    items: [
      { name: "Kyllingbryst", portion: "100 g", value: 32 },
      { name: "Storfekjøtt", portion: "100 g", value: 26 },
      { name: "Kalkunbryst", portion: "100 g", value: 29 },
      { name: "Laks", portion: "100 g", value: 23 },
      { name: "Tunfisk", portion: "100 g", value: 26.2 },
      { name: "Egg", portion: "2 stk", value: 13 },
      { name: "Reker", portion: "100 g", value: 18.9 },
      { name: "Gresk yoghurt", portion: "200 g", value: 8.9 },
      { name: "Cottage cheese", portion: "100 g", value: 12.5 },
      { name: "Melk (også laktosefri)", portion: "200 g", value: 6.4 },
      { name: "Tofu", portion: "100 g", value: 6.6 },
      { name: "Edamame", portion: "100 g", value: 10.9 },
      { name: "Quinoa", portion: "100 g", value: 12.1 },
      { name: "Sorte bønner", portion: "100 g", value: 8.8 },
      { name: "Kikerter", portion: "100 g", value: 6.7 },
      { name: "Peanøttsmør", portion: "100 g", value: 25 },
    ],
  },
  {
    key: "fett",
    label: "Sunt fett",
    unit: "g",
    blurb: "Energi · Hormoner · Hjernefunksjon",
    items: [
      { name: "Avokado", portion: "100 g", value: 15.3 },
      { name: "Mandler", portion: "100 g", value: 53.9 },
      { name: "Valnøtter", portion: "100 g", value: 63.6 },
      { name: "Chiafrø", portion: "100 g", value: 30.6 },
      { name: "Linfrø", portion: "50 g", value: 15.3 },
      { name: "Peanøttsmør", portion: "100 g", value: 49 },
      { name: "Cashewnøtter", portion: "100 g", value: 63.6 },
      { name: "Blandede frø", portion: "100 g", value: 27 },
      { name: "Macadamianøtter", portion: "100 g", value: 75.8 },
      { name: "Gresskarkjerner", portion: "100 g", value: 19 },
      { name: "Sesamfrø", portion: "100 g", value: 63.6 },
      { name: "Tahini", portion: "100 g", value: 56 },
      { name: "Mørk sjokolade", portion: "100 g", value: 42.6 },
      { name: "Eggeplomme", portion: "100 g", value: 25 },
      { name: "Lagret ost (parmesan)", portion: "100 g", value: 25.1 },
      { name: "Laks", portion: "100 g", value: 13.4 },
    ],
  },
  {
    key: "karbo",
    label: "Karbohydrater",
    unit: "g",
    blurb: "Energi · Prestasjon · Velvære",
    items: [
      { name: "Havregryn", portion: "30 g", value: 12 },
      { name: "Brun ris", portion: "100 g kokt", value: 25 },
      { name: "Søtpotet", portion: "100 g kokt", value: 18 },
      { name: "Potet", portion: "100 g kokt", value: 12 },
      { name: "Grovt brød", portion: "1 skive 30 g", value: 12 },
      { name: "Quinoa", portion: "100 g kokt", value: 17 },
      { name: "Røde bønner", portion: "100 g kokt", value: 14 },
      { name: "Couscous", portion: "100 g kokt", value: 25 },
      { name: "Hvit ris", portion: "100 g kokt", value: 28 },
      { name: "Gresskar", portion: "100 g kokt", value: 6 },
      { name: "Grønne erter", portion: "100 g kokt", value: 13 },
      { name: "Polenta", portion: "100 g", value: 23 },
      { name: "Fullkornspasta", portion: "100 g kokt", value: 34 },
      { name: "Hirse", portion: "100 g kokt", value: 16 },
      { name: "Flerkornblanding", portion: "100 g kokt", value: 21 },
      { name: "Bygg", portion: "100 g kokt", value: 28 },
    ],
  },
  {
    key: "fiber",
    label: "Fiber",
    unit: "g",
    blurb: "Bedre fordøyelse · Metthet · Tarmhelse",
    items: [
      { name: "Avokado", portion: "100 g", value: 6.3 },
      { name: "Bringebær", portion: "100 g", value: 6.2 },
      { name: "Kiwi", portion: "100 g", value: 3.0 },
      { name: "Pære", portion: "100 g", value: 3.3 },
      { name: "Eple", portion: "100 g", value: 2.0 },
      { name: "Artisjokk", portion: "100 g", value: 10.6 },
      { name: "Rosenkål", portion: "100 g", value: 4.2 },
      { name: "Gulrot", portion: "100 g", value: 3.2 },
      { name: "Søtpotet", portion: "100 g", value: 2.2 },
      { name: "Brokkoli", portion: "100 g", value: 2.4 },
      { name: "Potet", portion: "100 g", value: 1.4 },
      { name: "Quinoa", portion: "100 g", value: 6.2 },
      { name: "Havregryn", portion: "100 g", value: 9.1 },
      { name: "Linser", portion: "100 g", value: 8.0 },
      { name: "Sorte bønner", portion: "100 g", value: 8.4 },
      { name: "Pistasjnøtter", portion: "100 g", value: 6.5 },
    ],
  },
];

export type PlanDay = {
  day: string;
  frokost: string;
  lunsj: string;
  snack?: string;
  middag: string;
};

export const WEEK_PLANS: {
  key: "ned" | "opp" | "ned-lf" | "opp-lf";
  title: string;
  subtitle: string;
  principles: { title: string; text: string }[];
  days: PlanDay[];
}[] = [
  {
    key: "ned",
    title: "Ukeplan · Ned i vekt",
    subtitle: "Færre kalorier, mer næring, bedre resultat",
    principles: [
      { title: "Kaloriunderskudd", text: "Spis mindre enn du forbrenner." },
      { title: "Protein alltid", text: "I hvert måltid for å bevare muskler." },
      { title: "Kontrollert karbo", text: "Rene energikilder, smarte porsjoner." },
      { title: "Hydrering", text: "2–3 liter vann per dag." },
      { title: "Unngå flytende kalorier", text: "Nei til juice, brus og alkohol." },
    ],
    days: [
      {
        day: "Mandag",
        frokost: "Gresk yoghurt, bær, 10 mandler",
        lunsj: "Kyllingbryst, brun ris, grønn salat",
        middag: "Eggehviteomelett med spinat og avokado",
      },
      {
        day: "Tirsdag",
        frokost: "2 egg + 2 eggehviter, grovt brød",
        lunsj: "Magert storfekjøtt, brokkoli, søtpotet",
        middag: "Tunfisksalat med tomat og olivenolje",
      },
      {
        day: "Onsdag",
        frokost: "Proteinshake med havre og peanøttsmør",
        lunsj: "Kalkun, quinoa, sauterte grønnsaker",
        middag: "Laks med asparges",
      },
      {
        day: "Torsdag",
        frokost: "Gresk yoghurt, chiafrø, 1 frukt",
        lunsj: "Kylling, brun ris, salat",
        middag: "Eggehviteomelett med grønnsaker",
      },
      {
        day: "Fredag",
        frokost: "Grovt brød med avokado og egg",
        lunsj: "Laks med ovnsbakte grønnsaker",
        middag: "Stor kyllingsalat",
      },
      {
        day: "Lørdag",
        frokost: "Havregrøt med protein og kanel",
        lunsj: "Magert storfekjøtt, brun ris, salat",
        middag: "Kyllingwrap i salatblad (uten brød)",
      },
      {
        day: "Søndag",
        frokost: "Eggerøre med spinat og avokado",
        lunsj: "Kylling eller fisk, grønnsaker, liten potet",
        middag: "Lett salat med protein (tunfisk/kylling)",
      },
    ],
  },
  {
    key: "opp",
    title: "Ukeplan · Bygg muskler",
    subtitle: "Mer protein, mer energi, mer muskler",
    principles: [
      { title: "Mer protein", text: "Bygg og reparer muskelvev." },
      { title: "Mer energi", text: "Karbohydrater av god kvalitet." },
      { title: "Hydrering", text: "2–4 liter vann daglig." },
      { title: "Trening", text: "Styrke med progresjon + hvile." },
      { title: "Hvile", text: "7–9 timer søvn hver natt." },
    ],
    days: [
      {
        day: "Mandag",
        frokost: "Eggerøre med paprika, spinat og grovt brød",
        lunsj: "Grillet kylling med quinoa og ovnsgrønnsaker",
        snack: "Proteinshake med melk, banan og peanøttsmør",
        middag: "Ovnsbakt laks med brun ris og brokkoli",
      },
      {
        day: "Tirsdag",
        frokost: "Havregrøt med protein, blåbær og valnøtter",
        lunsj: "Storfekjøtt med søtpotet og bønner",
        snack: "Gresk yoghurt med granola og honning",
        middag: "Tunfisk-pastasalat med tomat og avokado",
      },
      {
        day: "Onsdag",
        frokost: "Havresmoothie med kakao, banan og peanøttsmør",
        lunsj: "Kalkun med brun ris og dampede grønnsaker",
        snack: "Riskaker med cottage cheese og honning",
        middag: "Hvit fisk med ovnspoteter og grønn salat",
      },
      {
        day: "Torsdag",
        frokost: "Grovt brød med avokado, tomat og chiafrø",
        lunsj: "Kikertgryte med brun ris og salat",
        snack: "Proteinshake med havre, kakao og mandler",
        middag: "Bakt kylling med quinoa og sauterte grønnsaker",
      },
      {
        day: "Fredag",
        frokost: "Cottage cheese med ananas, mandler og chiafrø",
        lunsj: "Grillet laks med potetmos og asparges",
        snack: "Banan med peanøttsmør",
        middag: "Magert storfekjøtt med brun ris og grønnsaker",
      },
      {
        day: "Lørdag",
        frokost: "Havrepannekaker med bær og peanøttsmør",
        lunsj: "Kyllingwrap med grønnsaker og hummus",
        snack: "Gresk yoghurt med bær og valnøtter",
        middag: "Sautert scampi med quinoa og grønnsaker",
      },
      {
        day: "Søndag",
        frokost: "Eggehviteomelett med sopp, spinat og grovt brød",
        lunsj: "Bakt kylling med ovnspoteter og salat",
        snack: "Proteinshake med melk, havre og kakao",
        middag: "Linsegryte med brød og avokado",
      },
    ],
  },
  {
    key: "ned-lf",
    title: "Ukeplan · Ned i vekt (laktosefri)",
    subtitle: "Kaloriunderskudd uten laktose – tilpasset Nora",
    principles: [
      { title: "Kaloriunderskudd", text: "Spis mindre enn du forbrenner." },
      { title: "Protein alltid", text: "I hvert måltid for å bevare muskler." },
      { title: "Laktosefrie meieri", text: "Laktosefri melk, yoghurt og kesam – eller soyadrikk." },
      { title: "Kalsium og B12", text: "Velg plantedrikk med tilsatt kalsium og B12." },
      { title: "Fiber først", text: "Quinoa, linser, bær og grønnsaker – 25–30 g fiber daglig." },
    ],
    days: [
      {
        day: "Mandag",
        frokost: "Laktosefri yoghurt naturell, bær, 10 mandler",
        lunsj: "Kyllingbryst, brun ris, grønn salat",
        middag: "Eggehviteomelett med spinat og avokado",
      },
      {
        day: "Tirsdag",
        frokost: "2 egg + 2 eggehviter, grovt brød",
        lunsj: "Magert storfekjøtt, brokkoli, søtpotet",
        middag: "Tunfisksalat med tomat og olivenolje",
      },
      {
        day: "Onsdag",
        frokost: "Proteinshake på soyadrikk med havre og peanøttsmør",
        lunsj: "Kalkun, quinoa, sauterte grønnsaker",
        middag: "Laks med asparges",
      },
      {
        day: "Torsdag",
        frokost: "Laktosefri kesam med chiafrø og 1 frukt",
        lunsj: "Kylling, brun ris, salat",
        middag: "Eggehviteomelett med grønnsaker",
      },
      {
        day: "Fredag",
        frokost: "Grovt brød med avokado og egg",
        lunsj: "Laks med ovnsbakte grønnsaker",
        middag: "Stor kyllingsalat med gresskarkjerner",
      },
      {
        day: "Lørdag",
        frokost: "Havregrøt på havredrikk med kanel og protein",
        lunsj: "Magert storfekjøtt, brun ris, salat",
        middag: "Kyllingwrap i salatblad",
      },
      {
        day: "Søndag",
        frokost: "Eggerøre med spinat og avokado",
        lunsj: "Kylling eller fisk, grønnsaker, liten potet",
        middag: "Lett salat med tunfisk (dressing uten fløte/rømme)",
      },
    ],
  },
  {
    key: "opp-lf",
    title: "Ukeplan · Bygg muskler (laktosefri)",
    subtitle: "Mer protein og energi – helt uten laktose",
    principles: [
      { title: "Mer protein", text: "1,8–2,2 g per kg kroppsvekt daglig." },
      { title: "Laktosefri energi", text: "Laktosefri melk, soyadrikk, ris, poteter og havre." },
      {
        title: "Sjekk pulver og sauser",
        text: "Myseproteinkonsentrat, sausposer og fløtesauser kan gi laktose.",
      },
      { title: "Hydrering", text: "2–4 liter vann daglig." },
      { title: "Hvile", text: "7–9 timer søvn + progresjon i styrke." },
    ],
    days: [
      {
        day: "Mandag",
        frokost: "Eggerøre med paprika, spinat og grovt brød",
        lunsj: "Grillet kylling med quinoa og ovnsgrønnsaker",
        snack: "Proteinshake på laktosefri melk med banan og peanøttsmør",
        middag: "Ovnsbakt laks med brun ris og brokkoli",
      },
      {
        day: "Tirsdag",
        frokost: "Havregrøt på soyadrikk med blåbær og valnøtter",
        lunsj: "Storfekjøtt med søtpotet og bønner",
        snack: "Laktosefri yoghurt med granola og honning",
        middag: "Tunfisk-pastasalat med tomat og avokado",
      },
      {
        day: "Onsdag",
        frokost: "Smoothie med havre, kakao, banan og peanøttsmør (soyadrikk)",
        lunsj: "Kalkun med brun ris og dampede grønnsaker",
        snack: "Riskaker med laktosefri cottage cheese og honning",
        middag: "Hvit fisk med ovnspoteter og salat",
      },
      {
        day: "Torsdag",
        frokost: "Grovt brød med avokado, tomat og chiafrø",
        lunsj: "Kikertgryte med brun ris og salat",
        snack: "Proteinshake (isolat) med mandler og kakao",
        middag: "Bakt kylling med quinoa og sauterte grønnsaker",
      },
      {
        day: "Fredag",
        frokost: "Laktosefri kesam med ananas, mandler og chiafrø",
        lunsj: "Grillet laks med potetmos (laktosefri melk) og asparges",
        snack: "Banan med peanøttsmør",
        middag: "Magert storfekjøtt med brun ris og grønnsaker",
      },
      {
        day: "Lørdag",
        frokost: "Havrepannekaker med bær (havredrikk)",
        lunsj: "Kyllingwrap med hummus og grønnsaker",
        snack: "Laktosefri yoghurt med bær og valnøtter",
        middag: "Sautert scampi med quinoa og grønnsaker",
      },
      {
        day: "Søndag",
        frokost: "Eggehviteomelett med sopp, spinat og grovt brød",
        lunsj: "Bakt kylling med ovnspoteter og salat",
        snack: "Proteinshake på laktosefri melk og havre",
        middag: "Linsegryte med avokado og brød",
      },
    ],
  },
];

/** Mifflin-St Jeor + aktivitetsfaktor */
export function calcCalorieNeed(opts: {
  sex: "mann" | "kvinne";
  weightKg: number;
  heightCm: number;
  age: number;
  activity: number;
  goal: "ned" | "vedlikehold" | "opp";
}): { tdee: number; target: number; protein: number; carbs: number; fat: number } {
  const bmr =
    10 * opts.weightKg + 6.25 * opts.heightCm - 5 * opts.age + (opts.sex === "mann" ? 5 : -161);
  const tdee = bmr * opts.activity;
  const target = opts.goal === "ned" ? tdee - 500 : opts.goal === "opp" ? tdee + 350 : tdee;
  const protein = Math.round(opts.weightKg * (opts.goal === "opp" ? 2.0 : 1.8));
  const fat = Math.round((target * 0.28) / 9);
  const carbs = Math.round((target - protein * 4 - fat * 9) / 4);
  return { tdee: Math.round(tdee), target: Math.round(target), protein, carbs, fat };
}

// ── Laktosefritt (Nora) ─────────────────────────────────────────────
export type LactoseItem = { name: string; note: string };

export const LACTOSE_SAFE: LactoseItem[] = [
  {
    name: "Laktosefri melk",
    note: "Tine laktosefri lett-/helmelk – samme protein og kalsium som vanlig melk",
  },
  { name: "Laktosefri yoghurt og kesam", note: "Fin proteinkilde til frokost og mellommåltid" },
  { name: "Laktosefri fløte og crème fraîche", note: "Fungerer 1:1 i saus, suppe og bakst" },
  {
    name: "Lagret ost",
    note: "Parmesan, Grana Padano, gammelost og godt lagret gulost er nesten laktosefri (<0,1 g)",
  },
  { name: "Smør", note: "Svært lite laktose – tåles som regel fint" },
  { name: "Plantedrikk", note: "Soya-, havre- og mandeldrikk – velg med tilsatt kalsium og B12" },
  { name: "Kokosyoghurt / soyayoghurt", note: "Laktosefritt, men soya gir klart mest protein" },
  {
    name: "Rent kjøtt, fisk og egg",
    note: "Uten fløtesaus, panering eller melkebaserte marinader",
  },
  { name: "Belgfrukter", note: "Linser, kikerter og bønner – protein, fiber og jern" },
  {
    name: "Nøtter, frø og tahini",
    note: "Naturlig laktosefritt og god kalsiumkilde (sesam/mandler)",
  },
  { name: "Frukt, bær og grønnsaker", note: "Alltid trygt i naturlig form" },
  { name: "Ris, poteter, havre og pasta", note: "Naturlig laktosefri energi" },
  { name: "Proteinisolat", note: "Myseisolat har svært lite laktose – konsentrat har mer" },
  { name: "Laktasetabletter", note: "Tas rett før måltid når du spiser ute og ikke vet innholdet" },
];

export const LACTOSE_AVOID: LactoseItem[] = [
  { name: "Vanlig melk og fløte", note: "Ca. 4,7 g laktose per 100 g – største kilden" },
  { name: "Myk og fersk ost", note: "Cottage cheese, ricotta, brunost og kremost har mye laktose" },
  { name: "Iskrem og melkesjokolade", note: "Velg laktosefri is eller mørk sjokolade 70 %+" },
  { name: "Fløtesauser og bearnaise", note: "Bytt til laktosefri fløte eller olje-/tomatbase" },
  { name: "Melkepulver og myse", note: "Skjuler seg i brød, potetgull, pølser og ferdigmat" },
  { name: "Sausposer og buljong", note: "Ofte tilsatt melkepulver – les etiketten" },
  { name: "Proteinpulver med konsentrat", note: "Konsentrat kan gi 5–8 % laktose – velg isolat" },
  { name: "Milkshake, latte og kakao", note: "Be om laktosefri melk eller soya på kafé" },
];

export const LACTOSE_TIPS: { title: string; text: string }[] = [
  {
    title: "Mengden avgjør",
    text: "De fleste tåler 5–12 g laktose per dag når det fordeles utover – ikke alt på én gang.",
  },
  {
    title: "Les alltid etiketten",
    text: "Se etter melk, myse, mysepulver, melkepulver og kasein i ingredienslisten.",
  },
  {
    title: "Lagret ost er trygt",
    text: "Jo lengre lagring, jo mindre laktose. Parmesan og gammelost er praktisk talt laktosefrie.",
  },
  {
    title: "Pass på kalsium",
    text: "Uten meieri: velg beriket plantedrikk, sardiner, mandler, sesam og mørkegrønne grønnsaker.",
  },
  {
    title: "Ute og spiser",
    text: "Si fra om laktoseintoleranse ved bestilling, og ha laktasetabletter i veska.",
  },
  {
    title: "Bygg opp toleranse",
    text: "Små mengder til faste måltid kan gi bedre toleranse over tid.",
  },
];
