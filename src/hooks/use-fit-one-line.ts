import { useEffect, useRef, useState } from "react";

/**
 * Måler et element og returnerer en em-skala (≤ 1) som krymper teksten
 * bare når innholdet ellers ikke får plass på én linje. Returnerer 1 når
 * `enabled = false` eller når innholdet allerede får plass.
 */
export function useFitOneLine<T extends HTMLElement>(
  enabled: boolean,
  deps: ReadonlyArray<unknown> = [],
  minScale = 0.55,
) {
  const ref = useRef<T | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!enabled) {
      setScale(1);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const fit = () => {
      // Reset til 1em for å måle den naturlige bredden
      el.style.fontSize = "";
      const available = el.clientWidth;
      const natural = el.scrollWidth;
      if (!available || natural <= available + 0.5) {
        setScale(1);
        return;
      }
      const next = Math.max(minScale, (available / natural) * 0.98);
      setScale(next);
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    if ((document as any).fonts?.ready) {
      (document as any).fonts.ready.then(fit).catch(() => {});
    }
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, minScale, ...deps]);

  return { ref, scale };
}
