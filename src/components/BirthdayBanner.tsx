interface Birthday {
  name: string;
  title: string;
  words: string;
  day: number;
  month: number;
  year: number;
}

const BIRTHDAYS: Birthday[] = [
  { name: "Arne", title: "Lord av Skien", words: "Med ære og ravner", day: 19, month: 4, year: 1973 },
  { name: "Rebekka", title: "Lady av Skien", words: "Sterk som vinterstormen", day: 30, month: 11, year: 1981 },
  { name: "Marita", title: "Den andre datter", words: "Ætt av sommerlys", day: 19, month: 4, year: 2004 },
  { name: "Celine", title: "Den røde flamme", words: "Ild av Skien", day: 9, month: 11, year: 2004 },
  { name: "Nora", title: "Den første datter", words: "Stille som måneskinn", day: 11, month: 9, year: 2001 },
  { name: "Mira", title: "Avkommet til Nora", words: "Liten løve", day: 17, month: 5, year: 2023 },
];

function getOsloDate(): { day: number; month: number; year: number } {
  // Bruk Europe/Oslo tidssone for å sikre riktig dato i Norge
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const year = parseInt(parts.find((p) => p.type === "year")!.value, 10);
  const month = parseInt(parts.find((p) => p.type === "month")!.value, 10);
  const day = parseInt(parts.find((p) => p.type === "day")!.value, 10);
  return { day, month, year };
}

function ordinalNorwegian(n: number): string {
  return `${n}.`;
}

export function BirthdayBanner() {
  const today = getOsloDate();
  const celebrants = BIRTHDAYS.filter(
    (b) => b.day === today.day && b.month === today.month
  );

  if (celebrants.length === 0) return null;

  return (
    <section className="container mx-auto px-4 pt-8">
      {celebrants.map((b) => {
        const age = today.year - b.year;
        return (
          <article
            key={b.name}
            className="panel rounded-lg p-6 sm:p-8 mb-4 text-center relative overflow-hidden glow-on-hover"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.22 0.04 30 / 0.6), oklch(0.20 0.014 240))",
            }}
          >
            <div className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                background:
                  "radial-gradient(ellipse at center, var(--gold), transparent 70%)",
              }}
            />
            <div className="relative">
              <div className="text-3xl sm:text-4xl mb-2">👑 ⚔ 🔥</div>
              <div className="text-display tracking-[0.3em] text-primary text-xs sm:text-sm uppercase mb-3">
                Krøniken kunngjør
              </div>
              <h2 className="heading-hero text-2xl sm:text-4xl mb-3">
                Gratulerer, {b.name}!
              </h2>
              <p className="text-medieval text-primary text-lg sm:text-2xl mb-2">
                "{b.words}"
              </p>
              <p className="text-foreground text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
                På denne {ordinalNorwegian(b.day)} dag i den {ordinalNorwegian(b.month)} måne
                fyller <span className="text-primary font-semibold">{b.title}</span>{" "}
                <span className="text-gold font-bold text-lg">{age}</span> vintre.
                Måtte ravnene bære gode budskap, hornet lyde i storsalen, og
                de gamle gudene våke over deg gjennom året som kommer.
              </p>
              <div className="ornate-divider mt-5">
                <span className="text-medieval text-primary text-sm">
                  ❦ Skål for husets ætt ❦
                </span>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
