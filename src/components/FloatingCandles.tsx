import { useMemo } from "react";

/** Svevende levende lys — Galtvort-stemning bak innholdet. */
export function FloatingCandles({ count = 22 }: { count?: number }) {
  const candles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: (i * 37) % 100,
        top: (i * 53) % 100,
        delay: (i % 11) * 0.9,
        duration: 7 + (i % 6),
      })),
    [count],
  );
  return (
    <div className="hogwarts-candles" aria-hidden>
      {candles.map((c, i) => (
        <span
          key={i}
          className="hogwarts-candle"
          style={{
            left: `${c.left}%`,
            top: `${c.top}%`,
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
