import { useEffect, useRef, useState } from "react";

type Props = {
  text: string;
  className?: string;
  max?: number; // max font-size in px
  min?: number; // min font-size in px
};

/**
 * Krymper teksten til den får plass på én linje i tilgjengelig bredde.
 * Lite tekst = stor font (opp til `max`), mye tekst = mindre font (ned til `min`).
 */
export function AutoFitText({ text, className, max = 14, min = 7 }: Props) {
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
      // Mål bredden ved max-fontstørrelse, deretter skaler ned
      measure.style.fontSize = `${max}px`;
      const naturalWidth = measure.scrollWidth;
      if (naturalWidth <= available) {
        setSize(max);
        return;
      }
      const scaled = Math.max(min, Math.floor((available / naturalWidth) * max));
      setSize(scaled);
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [text, max, min]);

  return (
    <div ref={wrapRef} className={`min-w-0 flex-1 overflow-hidden ${className ?? ""}`}>
      <span
        ref={measureRef}
        className="block whitespace-nowrap"
        style={{ fontSize: `${size}px`, lineHeight: 1.1 }}
      >
        {text}
      </span>
    </div>
  );
}
