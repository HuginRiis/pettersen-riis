import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/PageShell";
import heroImg from "@/assets/hero-westeros.jpg";

export const Route = createFileRoute("/pollen")({
  head: () => ({
    meta: [
      { title: "Pollenvarsel | House Riis" },
      { name: "description", content: "Pollenvarsel for Skien og hytta i Numedal." },
      { property: "og:title", content: "Pollenvarsel | House Riis" },
      { property: "og:description", content: "Pollenestimat for Skien og Lyngdal i Numedal." },
    ],
  }),
  component: PollenPage,
});

type Pollen = {
  name: string;
  level: string;
  intensity: number;
  color: string;
  note: string;
};

function PollenPage() {
  const groups = [
    { key: "skien", label: "Skien · Tollnes", items: pollenForToday("skien") },
    { key: "hytta", label: "Hytta · Lyngdal i Numedal", items: pollenForToday("hytta") },
  ];

  return (
    <PageShell>
      <PageHero
        eyebrow="Skien & Numedal · Norge"
        title="Pollenvarsel"
        subtitle="Estimat etter sesong (NAAF). For sanntid se naaf.no."
        image={heroImg}
      />

      <section className="container mx-auto px-4 py-12 space-y-12">
        {groups.map((group) => (
          <div key={group.key}>
            <div className="ornate-divider mb-6">
              <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
                {group.label}
              </span>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              {group.items.map((p) => (
                <div key={p.name} className="panel rounded-lg p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg text-foreground">{p.name}</h3>
                    <span
                      className="text-xs uppercase tracking-wider px-2 py-0.5 rounded border"
                      style={{ borderColor: p.color, color: p.color }}
                    >
                      {p.level}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{p.note}</p>
                  <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${p.intensity}%`, backgroundColor: p.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </PageShell>
  );
}

function pollenForToday(region: "skien" | "hytta" = "skien"): Pollen[] {
  const month = new Date().getMonth() + 1;
  const isHytta = region === "hytta";
  return [
    {
      name: "Or",
      ...rate(month, isHytta
        ? [{ months: [3, 4], level: "Høy", intensity: 75 }, { months: [2, 5], level: "Lav", intensity: 20 }]
        : [{ months: [2, 3], level: "Høy", intensity: 80 }, { months: [1, 4], level: "Lav", intensity: 25 }]),
      note: "Or blomstrer tidlig vår.",
    },
    {
      name: "Hassel",
      ...rate(month, isHytta
        ? [{ months: [3, 4], level: "Moderat", intensity: 50 }, { months: [2, 5], level: "Lav", intensity: 18 }]
        : [{ months: [2, 3], level: "Moderat", intensity: 55 }, { months: [1, 4], level: "Lav", intensity: 20 }]),
      note: "Hassel kommer ofte sammen med or.",
    },
    {
      name: "Bjørk",
      ...rate(month, isHytta
        ? [{ months: [5, 6], level: "Høy", intensity: 95 }, { months: [4, 7], level: "Moderat", intensity: 45 }]
        : [{ months: [4, 5], level: "Høy", intensity: 90 }, { months: [6], level: "Moderat", intensity: 40 }]),
      note: isHytta ? "Bjørkesesongen kommer 1-2 uker senere i Numedal." : "Den vanligste pollenallergien i Norge.",
    },
    {
      name: "Gress",
      ...rate(month, isHytta
        ? [{ months: [6, 7], level: "Høy", intensity: 80 }, { months: [8], level: "Moderat", intensity: 45 }]
        : [{ months: [6, 7], level: "Høy", intensity: 85 }, { months: [5, 8], level: "Moderat", intensity: 50 }]),
      note: "Toppsesong midtsommer.",
    },
    {
      name: "Burot",
      ...rate(month, isHytta
        ? [{ months: [7, 8], level: "Lav", intensity: 25 }]
        : [{ months: [7, 8], level: "Moderat", intensity: 60 }, { months: [9], level: "Lav", intensity: 25 }]),
      note: isHytta ? "Mindre burot i innlandet/fjellet." : "Sensommer-allergen.",
    },
    {
      name: "Salix",
      ...rate(month, isHytta
        ? [{ months: [5, 6], level: "Moderat", intensity: 55 }]
        : [{ months: [4, 5], level: "Moderat", intensity: 50 }]),
      note: "Selje/vier om våren.",
    },
  ];
}

function rate(
  month: number,
  rules: { months: number[]; level: string; intensity: number }[],
): { level: string; intensity: number; color: string } {
  for (const r of rules) {
    if (r.months.includes(month)) {
      return { level: r.level, intensity: r.intensity, color: levelColor(r.level) };
    }
  }
  return { level: "Ingen", intensity: 5, color: "oklch(0.55 0.04 240)" };
}

function levelColor(level: string) {
  switch (level) {
    case "Høy":
      return "oklch(0.65 0.20 25)";
    case "Moderat":
      return "oklch(0.78 0.15 70)";
    case "Lav":
      return "oklch(0.72 0.15 140)";
    default:
      return "oklch(0.55 0.04 240)";
  }
}
