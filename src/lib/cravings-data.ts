// Kunnskapsbase: "Sug dekodet" – hva kroppen egentlig prøver å si.
// Norsk bearbeiding av Paula Grubb Nutrition, "Top 10 cravings decoded".

export type Craving = {
  key: string;
  emoji: string;
  title: string;
  summary: string;
  causes: { title: string; text: string }[];
  swap: string;
  tags: string[];
};

export const CRAVING_REASONS: { title: string; text: string }[] = [
  {
    title: "Næringsmangel",
    text: "Mangler kroppen et næringsstoff, kan den sende ut sug etter mat den forbinder med det.",
  },
  {
    title: "Hormoner",
    text: "Svingninger i hormoner – for eksempel i menstruasjonssyklus eller svangerskap – øker suget.",
  },
  {
    title: "Følelser",
    text: "Stress, kjedsomhet og uro gir ofte sug etter trøstemat.",
  },
  {
    title: "Vane",
    text: "Spiser du alltid noe søtt etter middag, forventer kroppen det til samme tid neste dag.",
  },
];

export const CRAVINGS: Craving[] = [
  {
    key: "sukker",
    emoji: "🍬",
    title: "Sug etter sukker",
    summary: "Det vanligste suget av alle – og som regel et signal om ustabil energi.",
    causes: [
      { title: "Lavt energinivå", text: "Kroppen vil ha en rask energiboost." },
      { title: "Ustabilt blodsukker", text: "Svingende blodsukker trigger søtsug." },
      {
        title: "Magnesiummangel",
        text: "Magnesium er med på å regulere blodsukkeret; mangel gir ofte sjokoladesug.",
      },
      {
        title: "Ubalanse i tarmen",
        text: "Overvekst av candida/gjær lever av enkle karbohydrater og øker sukkersuget.",
      },
    ],
    swap: "Ta et stykke frukt, eller en magnesiumrik snack som nøtter og frø.",
    tags: ["søtt", "sjokolade", "godteri", "kake", "blodsukker", "magnesium"],
  },
  {
    key: "salt",
    emoji: "🧂",
    title: "Sug etter salt",
    summary: "Chips og saltmat sent på kvelden handler ofte om væske og stress.",
    causes: [
      { title: "Dehydrering", text: "Kroppen søker natrium for å holde på væske." },
      { title: "Stress / sliten binyre", text: "Langvarig stress kan gi saltsug." },
      { title: "Elektrolyttubalanse", text: "Behov for kalium, kalsium eller magnesium." },
    ],
    swap: "Velg naturlige saltkilder som oliven, tang eller saltede nøtter – i moderate mengder.",
    tags: ["chips", "salt", "snacks", "væske", "elektrolytter"],
  },
  {
    key: "karbo",
    emoji: "🍞",
    title: "Sug etter karbohydrater",
    summary: "Brød, pasta og potet frister når humøret eller energien er lav.",
    causes: [
      { title: "Serotonin", text: "Karbohydrater øker serotonin og løfter humøret." },
      {
        title: "Energibehov",
        text: "Mye aktivitet krever mer drivstoff. B-vitaminer trengs for å omdanne karbo til energi.",
      },
      { title: "Lavt stoffskifte", text: "Treg skjoldbruskkjertel gir lav energi og karbosug." },
      { title: "Kromemangel", text: "Lite krom gir ustabilt blodsukker og mer karbosug." },
    ],
    swap: "Velg hele korn: quinoa, havre eller søtpotet for jevn energi.",
    tags: ["brød", "pasta", "ris", "potet", "karbo", "serotonin", "stoffskifte"],
  },
  {
    key: "fett",
    emoji: "🍟",
    title: "Sug etter fet mat",
    summary: "Frityr og fet mat gir trøst – men kan også være et signal om for lite sunt fett.",
    causes: [
      {
        title: "For lite omega-3",
        text: "Essensielle fettsyrer trengs til celler, hjerne og hormoner.",
      },
      { title: "Trøst", text: "Fet mat utløser gode signalstoffer i hjernen." },
      { title: "Leveren jobber tungt", text: "Leveren omsetter fett og kan «be om» mer." },
    ],
    swap: "Bytt frityr med avokado, nøtter, frø og fet fisk som laks.",
    tags: ["frityr", "pommes", "fett", "omega-3", "lever"],
  },
  {
    key: "sjokolade",
    emoji: "🍫",
    title: "Sug etter sjokolade",
    summary: "Klassikeren – ofte magnesium, ofte følelser.",
    causes: [
      { title: "Magnesiummangel", text: "Sjokolade er en rik magnesiumkilde." },
      { title: "Trøst", text: "Sjokolade gir raske «feel good»-stoffer." },
      { title: "Stress", text: "Koffein og sukker gir et kort løft når du er tappet." },
    ],
    swap: "Mørk sjokolade 70 %+ i moderate mengder, eller magnesiumrik mat som bladgrønt og banan.",
    tags: ["sjokolade", "magnesium", "stress", "søtt"],
  },
  {
    key: "koffein",
    emoji: "☕",
    title: "Sug etter koffein",
    summary: "Trenger du egentlig kaffe – eller søvn?",
    causes: [
      { title: "Tretthet", text: "Kroppen trenger hvile, ikke stimulanter." },
      { title: "Jernmangel", text: "Jern frakter oksygen; lavt jern gir tretthet." },
    ],
    swap: "Prøv urtete eller adaptogener som gir energi uten koffeinkræsj.",
    tags: ["kaffe", "koffein", "energi", "jern", "søvn"],
  },
  {
    key: "meieri",
    emoji: "🧀",
    title: "Sug etter meieri",
    summary: "Ost og melk kan handle om kalsium, fett eller ren beroligelse.",
    causes: [
      { title: "Lavt stoffskifte", text: "Kan trigge sug etter ost og meieri." },
      { title: "Kalsiumbehov", text: "Kroppen kan mangle kalsium." },
      { title: "Beroligende effekt", text: "Ost inneholder kasomorfiner som virker beroligende." },
      { title: "For lite omega-3", text: "Sug etter fet ost kan bety behov for sunt fett." },
    ],
    swap: "Kalsium fra bladgrønt, chiafrø og tahini. Sunt fett fra valnøtter og laks. (Laktosefri variant: se Laktose-fanen.)",
    tags: ["ost", "melk", "meieri", "kalsium", "laktose"],
  },
  {
    key: "is",
    emoji: "🧊",
    title: "Sug etter is (isbiter)",
    summary: "Undervurdert signal – tygging av isbiter er et klassisk jernmangel-tegn.",
    causes: [
      { title: "Jernmangel", text: "Jernmangelanemi er den vanligste årsaken til å tygge is." },
      { title: "Stress / sansero", text: "Tygging kan virke beroligende ved uro og kjedsomhet." },
    ],
    swap: "Sjekk jernstatus. Spis bladgrønt, rødt kjøtt, linser og gresskarkjerner sammen med C-vitaminrik mat for bedre opptak.",
    tags: ["is", "isbiter", "jern", "anemi", "pagofagi"],
  },
  {
    key: "sterkt",
    emoji: "🌶️",
    title: "Sug etter sterk mat",
    summary: "Chili og varme krydder gir både varme og endorfiner.",
    causes: [
      { title: "Lav kroppstemperatur", text: "Fryser du ofte kan kroppen søke varme via mat." },
      { title: "Endorfiner", text: "Sterk mat gir et humørløft." },
      { title: "Treg fordøyelse", text: "Krydder kan sette fart på fordøyelsen." },
    ],
    swap: "Bruk ingefær, gurkemeie, cayenne eller chiliflak i måltidene – balansert.",
    tags: ["chili", "sterkt", "krydder", "varme", "fordøyelse"],
  },
  {
    key: "knasende",
    emoji: "🥕",
    title: "Sug etter noe knasende",
    summary: "Behovet for å knase handler ofte om stress – eller for lette måltider.",
    causes: [
      { title: "Stress og irritasjon", text: "Knasing gir en fysisk utladning." },
      { title: "Treg fordøyelse", text: "Kroppen kan søke grovt og fiberrikt." },
      { title: "For lite fett/protein", text: "Lette måltider gir utilfredshet og snacksug." },
    ],
    swap: "Gulrotstaver, selleri eller ristede kikerter – gjerne med hummus eller nøttesmør.",
    tags: ["chips", "knase", "snacks", "fiber", "protein"],
  },
];

export const CRAVING_EMOTION: { title: string; text: string }[] = [
  {
    title: "Fysisk sug",
    text: "Knyttet til næringsmangel eller energibehov. Kommer gradvis, og går over av vanlig mat.",
  },
  {
    title: "Følelsesmessig sug",
    text: "Kommer plutselig ved stress, uro eller kjedsomhet, og vil ha én bestemt trøstemat.",
  },
  {
    title: "Still deg spørsmålet",
    text: "«Er jeg sulten, eller søker jeg trøst?» Ett spørsmål avslører som regel hva slags sug det er.",
  },
];

export const CRAVING_TIPS: { title: string; text: string }[] = [
  { title: "Drikk vann først", text: "Tørste forveksles ofte med sult. Vent 10 minutter etterpå." },
  {
    title: "Balanserte måltider",
    text: "Protein + sunt fett + fiber i hvert måltid holder deg mett lenger.",
  },
  { title: "Sov nok", text: "Dårlig søvn øker sug etter sukker og raske karbohydrater." },
  { title: "Håndter stress", text: "Pust, tur, yoga eller meditasjon demper trøstespising." },
  {
    title: "Sjekk næringsstatus",
    text: "Mistenker du mangel på jern, magnesium eller B-vitaminer – ta en blodprøve.",
  },
  {
    title: "Spis bevisst",
    text: "Sett ned tempoet og kjenn etter. Da skiller du lettere sult fra sug.",
  },
];
