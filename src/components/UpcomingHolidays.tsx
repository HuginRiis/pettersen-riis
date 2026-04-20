/**
 * Viser kommende norske helligdager innen 14 dager.
 * Beregner bevegelige helligdager (påske m.fl.) med Meeus/Butcher-algoritmen.
 */

type Holiday = { date: Date; name: string; emoji: string; anim: string };

function computeEaster(year: number): Date {
  // Meeus/Jones/Butcher algoritme — gregoriansk påskedag
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=mars, 4=april
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function getNorwegianHolidays(year: number): Holiday[] {
  const easter = computeEaster(year);
  return [
    { date: new Date(year, 0, 1), name: "Første nyttårsdag", emoji: "🎆" },
    { date: addDays(easter, -3), name: "Skjærtorsdag", emoji: "🕯" },
    { date: addDays(easter, -2), name: "Langfredag", emoji: "✝️" },
    { date: easter, name: "Første påskedag", emoji: "🐣" },
    { date: addDays(easter, 1), name: "Andre påskedag", emoji: "🥚" },
    { date: new Date(year, 4, 1), name: "Arbeidernes dag", emoji: "🛠" },
    { date: new Date(year, 4, 17), name: "Grunnlovsdag", emoji: "🇳🇴" },
    { date: addDays(easter, 39), name: "Kristi himmelfartsdag", emoji: "☁️" },
    { date: addDays(easter, 49), name: "Første pinsedag", emoji: "🔥" },
    { date: addDays(easter, 50), name: "Andre pinsedag", emoji: "🕊" },
    { date: new Date(year, 11, 25), name: "Første juledag", emoji: "🎄" },
    { date: new Date(year, 11, 26), name: "Andre juledag", emoji: "🎁" },
  ];
}

function getOsloMidnightToday(): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const y = parseInt(parts.find((p) => p.type === "year")!.value, 10);
  const m = parseInt(parts.find((p) => p.type === "month")!.value, 10);
  const d = parseInt(parts.find((p) => p.type === "day")!.value, 10);
  return new Date(y, m - 1, d);
}

const WEEKDAYS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const MONTHS = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

function formatLongDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

function daysUntilLabel(n: number): string {
  if (n === 0) return "i dag";
  if (n === 1) return "i morgen";
  return `om ${n} dager`;
}

export function UpcomingHolidays() {
  const today = getOsloMidnightToday();
  const yearNow = today.getFullYear();
  const all = [...getNorwegianHolidays(yearNow), ...getNorwegianHolidays(yearNow + 1)];

  const horizon = addDays(today, 30);
  const upcoming = all
    .filter((h) => h.date >= today && h.date <= horizon)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (upcoming.length === 0) return null;

  return (
    <section className="container mx-auto px-4 pb-16">
      <div className="ornate-divider mb-8">
        <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
          Helligdager innen 30 dager
        </span>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
        {upcoming.map((h) => {
          const ms = h.date.getTime() - today.getTime();
          const days = Math.round(ms / (1000 * 60 * 60 * 24));
          const isToday = days === 0;
          return (
            <article
              key={`${h.name}-${h.date.toISOString()}`}
              className={`panel rounded-lg p-4 sm:p-5 glow-on-hover relative overflow-hidden ${
                isToday ? "ring-2 ring-primary" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="text-3xl sm:text-4xl shrink-0" aria-hidden>
                  {h.emoji}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] tracking-[0.3em] text-primary uppercase">
                    {daysUntilLabel(days)}
                  </div>
                  <h3 className="text-base sm:text-lg text-foreground mt-0.5 leading-tight">
                    {h.name}
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1 capitalize">
                    {formatLongDate(h.date)}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
