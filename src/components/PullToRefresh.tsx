import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * PullToRefresh — drar man ned øverst på siden, lastes siden på nytt.
 *
 * Aktiveres kun når:
 *  - Siden er lagt til på hjemskjerm (PWA standalone-modus), ELLER
 *  - Vi er på en touch-enhet (mobil/nettbrett)
 *
 * Slik unngår vi at desktop-brukere får uventet refresh-oppførsel.
 */
const THRESHOLD = 80; // px man må dra for å trigge refresh
const MAX_PULL = 140; // maks dra-avstand før vi capper

export function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const active = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Kun aktiv i standalone (hjemskjerm) eller på touch-enheter
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari spesial-flagg
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

    if (!isStandalone && !isTouch) return;

    const onTouchStart = (e: TouchEvent) => {
      // Bare hvis vi er helt øverst på siden
      if (window.scrollY > 0) {
        startY.current = null;
        active.current = false;
        return;
      }
      startY.current = e.touches[0].clientY;
      active.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!active.current || startY.current === null || refreshing) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) {
        setPull(0);
        return;
      }
      // Demp dra-følelsen (resistance)
      const damped = Math.min(MAX_PULL, delta * 0.5);
      setPull(damped);
      // Forhindre standard scroll/bounce når vi drar ned
      if (delta > 5 && e.cancelable) {
        e.preventDefault();
      }
    };

    const onTouchEnd = () => {
      if (!active.current) return;
      active.current = false;
      startY.current = null;
      if (pull >= THRESHOLD && !refreshing) {
        setRefreshing(true);
        setPull(60);
        // Kort delay slik at brukeren ser spinneren før reload
        setTimeout(() => {
          window.location.reload();
        }, 300);
      } else {
        setPull(0);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [pull, refreshing]);

  if (pull <= 0 && !refreshing) return null;

  const progress = Math.min(1, pull / THRESHOLD);
  const ready = pull >= THRESHOLD;

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 top-0 z-[100] flex justify-center"
      style={{
        transform: `translateY(${Math.max(0, pull - 30)}px)`,
        transition: refreshing ? "transform 200ms ease" : active.current ? "none" : "transform 250ms ease",
      }}
    >
      <div
        className="mt-2 flex h-10 w-10 items-center justify-center rounded-full border border-primary/40 bg-background/80 shadow-lg backdrop-blur-sm"
        style={{ opacity: Math.max(0.4, progress) }}
      >
        <RefreshCw
          size={18}
          className={ready || refreshing ? "text-primary" : "text-muted-foreground"}
          style={{
            transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
            animation: refreshing ? "spin 0.8s linear infinite" : undefined,
            transition: refreshing ? undefined : "transform 80ms linear",
          }}
        />
      </div>
    </div>
  );
}
