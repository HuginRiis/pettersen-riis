import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Min skala (0..1). Standard 0.6 = ned til 60 % */
  minScale?: number;
  /** Aktiver krymping. Hvis false, oppfører seg som en vanlig div. */
  enabled?: boolean;
};

/**
 * Wrapper som beholder normal skriftstørrelse, og kun krymper teksten
 * (via em-basert font-size) når innholdet ellers ikke får plass på én linje.
 */
export function FitOneLine({ children, className, minScale = 0.55, enabled = true }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!enabled) {
      setScale(1);
      return;
    }
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;

    const fit = () => {
      // Mål ved 100 % først
      inner.style.fontSize = "1em";
      const available = wrap.clientWidth;
      if (!available) return;
      const natural = inner.scrollWidth;
      if (natural <= available + 0.5) {
        setScale(1);
        return;
      }
      const next = Math.max(minScale, (available / natural) * 0.98);
      setScale(next);
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    ro.observe(inner);
    if ((document as any).fonts?.ready) {
      (document as any).fonts.ready.then(fit).catch(() => {});
    }
    return () => ro.disconnect();
  }, [enabled, minScale, children]);

  if (!enabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div ref={wrapRef} className={`min-w-0 overflow-hidden ${className ?? ""}`}>
      <div
        ref={innerRef}
        className="whitespace-nowrap"
        style={{ fontSize: `${scale}em`, display: "inline-flex", alignItems: "center", gap: "inherit", width: "max-content", maxWidth: "100%" }}
      >
        {children}
      </div>
    </div>
  );
}
