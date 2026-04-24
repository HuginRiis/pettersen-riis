import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Birthday = {
  id: string;
  name: string;
  birth_date: string;
  title: string | null;
  words: string | null;
};

function getOsloDate(): { day: number; month: number; year: number } {
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
  const [items, setItems] = useState<Birthday[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("birthdays" as any)
        .select("id, name, birth_date, title, words");
      if (alive && data) setItems(data as unknown as Birthday[]);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const today = getOsloDate();
  const celebrants = items.filter((b) => {
    const [, m, d] = b.birth_date.split("-").map(Number);
    return m === today.month && d === today.day;
  });

  if (celebrants.length === 0) return null;

  return (
    <section className="container mx-auto px-4 pt-8">
      {celebrants.map((b) => {
        const [by] = b.birth_date.split("-").map(Number);
        const age = today.year - by;
        return (
          <article
            key={b.id}
            className="panel rounded-lg p-6 sm:p-8 mb-4 text-center relative overflow-hidden glow-on-hover"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.22 0.04 30 / 0.6), oklch(0.20 0.014 240))",
            }}
          >
            <div
              className="absolute inset-0 pointer-events-none opacity-20"
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
              {b.words && (
                <p className="text-medieval text-primary text-lg sm:text-2xl mb-2">
                  "{b.words}"
                </p>
              )}
              <p className="text-foreground text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
                På denne {ordinalNorwegian(today.day)} dag i den {ordinalNorwegian(today.month)} måne
                fyller{" "}
                <span className="text-primary font-semibold">
                  {b.title ?? b.name}
                </span>{" "}
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
