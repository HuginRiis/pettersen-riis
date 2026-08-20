// Statisk kunnskapsgrunnlag for kosthold-siden: næringskilder, laktosefrie
// produkter (Nora) og ukeplaner. Alle verdier er omtrentlige per 100 g
// om ikke annet er nevnt.

export type FoodSource = {
  name: string;
  emoji: string;
  per: string;
  kcal: number;
  value: number; // hovednæringsstoff i gram
};

export type SourceGroup = {
  key: "protein" | "fett" | "karbo" | "fiber";
  title: string;
  unitLabel: string;
  blurb: string;
  color: string;
  items: FoodSource[];
};

export const SOURCE_GROUPS: SourceGroup[] = [
  {
    key: "protein",
    title: "Proteinkilder",
    unitLabel: "protein",
    color: "#f87171",
    blurb:
      "Protein bygger og vedlikeholder muskler, metter godt og bevarer muskelmasse i vektnedgang. Sikt mot 1,6–2,2 g per kg kroppsvekt om du trener styrke.",
    items: [
      { name: "Kyllingbryst", emoji: "🍗", per: "100 g", kcal: 165, value: 31 },
      { name: "Kalkun", emoji: "🦃", per: "100 g", kcal: 135, value: 29 },
      { name: "Storfe, magert", emoji: "🥩", per: "100 g", kcal: 217, value: 26 },
      { name: "Laks", emoji: "🐟", per: "100 g", kcal: 208, value: 20 },
      { name: "Tunfisk i vann", emoji: "🐠", per: "100 g", kcal: 116, value: 26 },
      { name: "Reker", emoji: "🦐", per: "100 g", kcal: 99, value: 24 },
      { name: "Egg", emoji: "🥚", per: "2 stk", kcal: 143, value: 13 },
      { name: "Cottage cheese", emoji: "🧀", per: "100 g", kcal: 98, value: 11 },
      { name: "Gresk yoghurt", emoji: "🥛", per: "100 g", kcal: 59, value: 10 },
      { name: "Linser, kokte", emoji: "🫘", per: "100 g", kcal: 116, value: 9 },
      { name: "Kikerter", emoji: "🫛", per: "100 g", kcal: 164, value: 9 },
      { name: "Tofu", emoji: "🧊", per: "100 g", kcal: 144, value: 17 },
      { name: "Edamame", emoji: "🌱", per: "100 g", kcal: 121, value: 12 },
      { name: "Myseprotein (pulver)", emoji: "🥤", per: "30 g", kcal: 120, value: 24 },
    ],
  },
  {
    key: "fett",
    title: "Fettkilder",
    unitLabel: "fett",
    color: "#fbbf24",
    blurb:
      "Sunt fett gir hormonbalanse, opptak av vitamin A, D, E og K og lang metthet. Prioriter umettet fett fra fisk, nøtter, oliven og avokado.",
    items: [
      { name: "Avokado", emoji: "🥑", per: "1/2 stk", kcal: 160, value: 15 },
      { name: "Olivenolje", emoji: "🫒", per: "1 ss", kcal: 119, value: 14 },
      { name: "Mandler", emoji: "🌰", per: "30 g", kcal: 174, value: 15 },
      { name: "Valnøtter", emoji: "🥜", per: "30 g", kcal: 196, value: 20 },
      { name: "Peanøttsmør", emoji: "🥜", per: "2 ss", kcal: 188, value: 16 },
      { name: "Chiafrø", emoji: "🌾", per: "30 g", kcal: 138, value: 9 },
      { name: "Linfrø", emoji: "🌾", per: "30 g", kcal: 160, value: 13 },
      { name: "Laks (fet fisk)", emoji: "🐟", per: "100 g", kcal: 208, value: 13 },
      { name: "Makrell", emoji: "🐟", per: "100 g", kcal: 205, value: 14 },
      { name: "Egg (plomme)", emoji: "🥚", per: "2 stk", kcal: 143, value: 10 },
      { name: "Mørk sjokolade 85 %", emoji: "🍫", per: "30 g", kcal: 170, value: 13 },
      { name: "Kokosolje", emoji: "🥥", per: "1 ss", kcal: 121, value: 14 },
    ],
  },
  {
    key: "karbo",
    title: "Karbohydratkilder",
    unitLabel: "karbo",
    color: "#60a5fa",
    blurb:
      "Karbohydrater er kroppens raskeste energikilde. Velg langsomme, fiberrike kilder — de gir jevnt blodsukker og bedre trening.",
    items: [
      { name: "Havregryn", emoji: "🥣", per: "100 g", kcal: 379, value: 67 },
      { name: "Fullkornspasta", emoji: "🍝", per: "100 g kokt", kcal: 124, value: 26 },
      { name: "Brun ris", emoji: "🍚", per: "100 g kokt", kcal: 123, value: 26 },
      { name: "Quinoa", emoji: "🌾", per: "100 g kokt", kcal: 120, value: 21 },
      { name: "Søtpotet", emoji: "🍠", per: "100 g", kcal: 86, value: 20 },
      { name: "Potet", emoji: "🥔", per: "100 g", kcal: 77, value: 17 },
      { name: "Fullkornsbrød", emoji: "🍞", per: "1 skive", kcal: 90, value: 15 },
      { name: "Banan", emoji: "🍌", per: "1 stk", kcal: 105, value: 27 },
      { name: "Eple", emoji: "🍎", per: "1 stk", kcal: 95, value: 25 },
      { name: "Bønner, kokte", emoji: "🫘", per: "100 g", kcal: 127, value: 23 },
      { name: "Mais", emoji: "🌽", per: "100 g", kcal: 96, value: 21 },
      { name: "Bygg", emoji: "🌾", per: "100 g kokt", kcal: 123, value: 28 },
    ],
  },
  {
    key: "fiber",
    title: "Fiberkilder",
    unitLabel: "fiber",
    color: "#34d399",
    blurb:
      "Fiber metter, roer blodsukkeret og gir god magehelse. Mål: 30–35 g per dag. Øk gradvis og drikk nok vann.",
    items: [
      { name: "Bringebær", emoji: "🫐", per: "100 g", kcal: 52, value: 6.5 },
      { name: "Artisjokk", emoji: "🌿", per: "1 stk", kcal: 60, value: 7 },
      { name: "Linser, kokte", emoji: "🫘", per: "100 g", kcal: 116, value: 8 },
      { name: "Svarte bønner", emoji: "🫘", per: "100 g", kcal: 132, value: 9 },
      { name: "Chiafrø", emoji: "🌾", per: "30 g", kcal: 138, value: 10 },
      { name: "Havregryn", emoji: "🥣", per: "100 g", kcal: 379, value: 10 },
      { name: "Pære med skall", emoji: "🍐", per: "1 stk", kcal: 101, value: 5.5 },
      { name: "Brokkoli", emoji: "🥦", per: "100 g", kcal: 34, value: 2.6 },
      { name: "Rosenkål", emoji: "🥬", per: "100 g", kcal: 43, value: 3.8 },
      { name: "Avokado", emoji: "🥑", per: "1/2 stk", kcal: 160, value: 7 },
      { name: "Mandler", emoji: "🌰", per: "30 g", kcal: 174, value: 3.5 },
      { name: "Fullkornsbrød", emoji: "🍞", per: "1 skive", kcal: 90, value: 3 },
    ],
  },
];

// ---------- Nora: laktosefritt ----------

export type LactoseProduct = {
  name: string;
  brand: string;
  category: string;
  note: string;
  kcalPer100: number | null;
  proteinPer100: number | null;
};

export const NORA_LACTOSE_FREE: LactoseProduct[] = [
  { name: "Laktosefri lettmelk", brand: "Tine", category: "Melk", note: "Samme næring som vanlig melk, laktosen er spaltet.", kcalPer100: 41, proteinPer100: 3.4 },
  { name: "Laktosefri helmelk", brand: "Tine", category: "Melk", note: "Litt søtere smak fordi laktosen er delt i glukose og galaktose.", kcalPer100: 61, proteinPer100: 3.3 },
  { name: "Laktosefri kremfløte", brand: "Tine", category: "Fløte", note: "Fungerer i saus og bakst som vanlig fløte.", kcalPer100: 340, proteinPer100: 2.1 },
  { name: "Laktosefri yoghurt naturell", brand: "Tine", category: "Yoghurt", note: "Fin base til frokost med bær og nøtter.", kcalPer100: 63, proteinPer100: 4.2 },
  { name: "Laktosefri kesam", brand: "Tine", category: "Kvarg", note: "Proteinbombe til mellommåltid.", kcalPer100: 71, proteinPer100: 11 },
  { name: "Laktosefri gulost", brand: "Tine / Synnøve", category: "Ost", note: "Godt lagret hvitost er ofte naturlig nesten laktosefri.", kcalPer100: 350, proteinPer100: 27 },
  { name: "Parmesan / Grana Padano", brand: "Diverse", category: "Ost", note: "Naturlig laktosefri pga lang lagring (< 0,1 g laktose).", kcalPer100: 402, proteinPer100: 33 },
  { name: "Havredrikk uten sukker", brand: "Oatly / Alpro", category: "Plantedrikk", note: "Velg variant med tilsatt kalsium og B12.", kcalPer100: 45, proteinPer100: 1 },
  { name: "Soyadrikk naturell", brand: "Alpro", category: "Plantedrikk", note: "Den plantedrikken som ligner mest på melk i protein.", kcalPer100: 33, proteinPer100: 3.3 },
  { name: "Kokosyoghurt", brand: "Diverse", category: "Yoghurt", note: "Laktosefri, men lite protein — kombiner med nøtter.", kcalPer100: 130, proteinPer100: 1 },
  { name: "Laktosefri iskrem", brand: "Diplom-Is", category: "Dessert", note: "Til helgekos uten magetrøbbel.", kcalPer100: 200, proteinPer100: 3 },
  { name: "Laktasetabletter", brand: "Apotek", category: "Hjelpemiddel", note: "Tas rett før måltid når du spiser ute.", kcalPer100: null, proteinPer100: null },
];

export const NORA_TIPS: string[] = [
  "Laktoseintoleranse handler om mengde — de fleste tåler 5–12 g laktose fordelt utover dagen.",
  "Faste, lagrede oster (parmesan, gammelost, godt lagret jarlsberg) er nesten laktosefrie fra naturens side.",
  "Smør inneholder svært lite laktose og tåles som regel fint.",
  "Sjekk ferdigmat: laktose gjemmer seg i brød, pølser, sausposer, potetgull og sjokolade.",
  "Bytt melk mot laktosefri melk eller soyadrikk for å beholde protein og kalsium.",
  "Ta laktasetablett rett før måltid hvis du spiser ute og ikke vet innholdet.",
];

// ---------- Ukeplaner ----------

export type PlanMeal = { label: string; text: string; kcal: number };
export type PlanDay = { day: string; meals: PlanMeal[] };
export type WeekPlan = {
  id: "ned-i-vekt" | "bygg-muskler";
  title: string;
  goal: string;
  kcalTarget: string;
  macros: string;
  days: PlanDay[];
};

export const WEEK_PLANS: WeekPlan[] = [
  {
    id: "ned-i-vekt",
    title: "Ukeplan – ned i vekt (laktosefri)",
    goal: "Rolig vektnedgang på 0,4–0,7 kg i uka med mye protein og fiber slik at du holder deg mett.",
    kcalTarget: "ca. 1600–1800 kcal per dag",
    macros: "Protein 130–150 g · Karbo 130–160 g · Fett 55–65 g · Fiber 30 g+",
    days: [
      {
        day: "Mandag",
        meals: [
          { label: "Frokost", text: "Havregrøt på havredrikk med bringebær, chiafrø og kanel", kcal: 380 },
          { label: "Lunsj", text: "Kyllingsalat med quinoa, avokado, agurk og olivenolje", kcal: 520 },
          { label: "Middag", text: "Ovnsbakt laks med brokkoli og søtpotet", kcal: 600 },
          { label: "Snacks", text: "Laktosefri kesam med blåbær", kcal: 180 },
        ],
      },
      {
        day: "Tirsdag",
        meals: [
          { label: "Frokost", text: "Eggerøre av 3 egg med spinat og fullkornsbrød", kcal: 400 },
          { label: "Lunsj", text: "Linsesuppe med gulrot og selleri + 1 skive fullkorn", kcal: 470 },
          { label: "Middag", text: "Kalkunwok med paprika, brokkoli og brun ris", kcal: 620 },
          { label: "Snacks", text: "Eple og 15 mandler", kcal: 190 },
        ],
      },
      {
        day: "Onsdag",
        meals: [
          { label: "Frokost", text: "Laktosefri yoghurt med jordbær, valnøtter og linfrø", kcal: 360 },
          { label: "Lunsj", text: "Tunfisksalat (vann) med bønner, tomat og rødløk", kcal: 480 },
          { label: "Middag", text: "Kyllinggryte med kikerter, tomat og squash", kcal: 610 },
          { label: "Snacks", text: "Gulrotstaver med hummus", kcal: 170 },
        ],
      },
      {
        day: "Torsdag",
        meals: [
          { label: "Frokost", text: "Smoothie: soyadrikk, banan, spinat, peanøttsmør", kcal: 390 },
          { label: "Lunsj", text: "Reke- og avokadosalat med quinoa", kcal: 500 },
          { label: "Middag", text: "Torsk med potet, erter og sitronsmør", kcal: 570 },
          { label: "Snacks", text: "Laktosefri kesam med kanel", kcal: 150 },
        ],
      },
      {
        day: "Fredag",
        meals: [
          { label: "Frokost", text: "Overnight oats med havredrikk, chia og bringebær", kcal: 380 },
          { label: "Lunsj", text: "Wrap med kylling, salat og hummus (fullkorn)", kcal: 520 },
          { label: "Middag", text: "Hjemmelaget taco med magert kjøttdeig, mais og salat", kcal: 640 },
          { label: "Snacks", text: "30 g mørk sjokolade 85 %", kcal: 170 },
        ],
      },
      {
        day: "Lørdag",
        meals: [
          { label: "Frokost", text: "Omelett med sopp, tomat og laktosefri gulost", kcal: 420 },
          { label: "Lunsj", text: "Suppe av røstede grønnsaker + kokt egg", kcal: 430 },
          { label: "Middag", text: "Grillet biff med ovnsbakte rotgrønnsaker", kcal: 660 },
          { label: "Snacks", text: "Frukt og en neve valnøtter", kcal: 210 },
        ],
      },
      {
        day: "Søndag",
        meals: [
          { label: "Frokost", text: "Fullkornsbrød med avokado og to posjerte egg", kcal: 430 },
          { label: "Lunsj", text: "Storfesalat med bønner, mais og lime", kcal: 490 },
          { label: "Middag", text: "Ovnsbakt kylling med søtpotetmos og brokkoli", kcal: 620 },
          { label: "Snacks", text: "Laktosefri yoghurt med bær", kcal: 170 },
        ],
      },
    ],
  },
  {
    id: "bygg-muskler",
    title: "Ukeplan – bygg muskler (laktosefri)",
    goal: "Lite kalorioverskudd og mye protein for å bygge muskler uten unødig fettøkning.",
    kcalTarget: "ca. 2600–2900 kcal per dag",
    macros: "Protein 170–200 g · Karbo 300–330 g · Fett 80–90 g · Fiber 35 g+",
    days: [
      {
        day: "Mandag",
        meals: [
          { label: "Frokost", text: "Havregrøt på soyadrikk med banan, peanøttsmør og myseprotein", kcal: 750 },
          { label: "Lunsj", text: "Kylling, brun ris, brokkoli og olivenolje", kcal: 820 },
          { label: "Middag", text: "Laks med fullkornspasta og pesto", kcal: 880 },
          { label: "Snacks", text: "Laktosefri kesam med honning og mandler", kcal: 380 },
        ],
      },
      {
        day: "Tirsdag",
        meals: [
          { label: "Frokost", text: "4 egg, 2 skiver fullkorn, avokado", kcal: 720 },
          { label: "Lunsj", text: "Kjøttdeig med bønner, ris og salsa", kcal: 850 },
          { label: "Middag", text: "Kalkunwok med nudler og cashew", kcal: 870 },
          { label: "Snacks", text: "Proteinshake på havredrikk + banan", kcal: 400 },
        ],
      },
      {
        day: "Onsdag",
        meals: [
          { label: "Frokost", text: "Overnight oats med chia, valnøtter og myseprotein", kcal: 740 },
          { label: "Lunsj", text: "Tunfiskbowl med quinoa, edamame og avokado", kcal: 840 },
          { label: "Middag", text: "Biff med bakt potet og rotgrønnsaker", kcal: 890 },
          { label: "Snacks", text: "Laktosefri yoghurt med granola", kcal: 390 },
        ],
      },
      {
        day: "Torsdag",
        meals: [
          { label: "Frokost", text: "Omelett med 4 egg, laktosefri ost og spinat + brød", kcal: 760 },
          { label: "Lunsj", text: "Kyllingwrap x2 med hummus og salat", kcal: 830 },
          { label: "Middag", text: "Torsk med søtpotetmos, smør og erter", kcal: 820 },
          { label: "Snacks", text: "Peanøttsmør på fullkorn + melk (laktosefri)", kcal: 420 },
        ],
      },
      {
        day: "Fredag",
        meals: [
          { label: "Frokost", text: "Smoothie: soyadrikk, havre, bær, protein, peanøttsmør", kcal: 780 },
          { label: "Lunsj", text: "Lakseburger med fullkornsbrød og coleslaw", kcal: 850 },
          { label: "Middag", text: "Taco med kjøttdeig, ris, bønner og guacamole", kcal: 900 },
          { label: "Snacks", text: "Mørk sjokolade og mandler", kcal: 350 },
        ],
      },
      {
        day: "Lørdag",
        meals: [
          { label: "Frokost", text: "Pannekaker av havre, egg og banan med bær", kcal: 780 },
          { label: "Lunsj", text: "Kylling caesar med parmesan (naturlig laktosefri)", kcal: 820 },
          { label: "Middag", text: "Entrecôte med ovnspotet og bearnaise på laktosefri fløte", kcal: 950 },
          { label: "Snacks", text: "Kesam med bær og honning", kcal: 350 },
        ],
      },
      {
        day: "Søndag",
        meals: [
          { label: "Frokost", text: "Egg og bacon med fullkornsbrød og avokado", kcal: 780 },
          { label: "Lunsj", text: "Pastasalat med kylling, pesto og pinjekjerner", kcal: 840 },
          { label: "Middag", text: "Helstekt kylling med ris og grønnsaker", kcal: 870 },
          { label: "Snacks", text: "Proteinshake + banan", kcal: 400 },
        ],
      },
    ],
  },
];

export const MEAL_TYPES = ["frokost", "lunsj", "middag", "snacks", "annet"] as const;
export type MealType = (typeof MEAL_TYPES)[number];
