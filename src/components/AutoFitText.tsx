import { useEffect, useRef, useState } from "react";

type Props = {
  text: string;
  className?: string;
  max?: number; // max font-size in px
  min?: number; // min font-size in px
};

/**
 * Krymper teksten så den får plass på én linje. Mye tekst = bittelitt font.
 */
export function AutoFitText({ text, className, max = 14, min = 5 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(max);

  useEffect(() => {
    const wrap = wrapRef.current;
    const measure = measureRef.current;
    if (!wrap || !measure) return;

    const fit = () => {
      const available = wrap.clientWidth;
      if (!available) return;
      // Mål ved max og skaler ned proporsjonalt, deretter finjuster.
      measure.style.fontSize = `${max}px`;
      const naturalWidth = measure.scrollWidth;
      if (naturalWidth <= available) {
        setSize(max);
        return;
      }
      // Litt margin (0.96) for å unngå sub-pixel overflow.
      let next = Math.max(min, Math.floor((available / naturalWidth) * max * 0.96));
      // Sikkerhetsnett: krymp videre hvis det fortsatt overflower.
      measure.style.fontSize = `${next}px`;
      let guard = 12;
      while (measure.scrollWidth > available && next > min && guard-- > 0) {
        next -= 1;
        measure.style.fontSize = `${next}px`;
      }
      setSize(next);
    };

    fit();
    // Re-fit etter at fonter har lastet
    if ((document as any).fonts?.ready) {
      (document as any).fonts.ready.then(fit).catch(() => {});
    }
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [text, max, min]);

  return (
    <div ref={wrapRef} className={`min-w-0 flex-1 overflow-hidden ${className ?? ""}`}>
      <span
        ref={measureRef}
        className="block whitespace-nowrap"
        style={{ fontSize: `${size}px`, lineHeight: 1.1, letterSpacing: "0.02em" }}
      >
        {text}
      </span>
    </div>
  );
}
