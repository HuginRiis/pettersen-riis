import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import {
  getFontDeltaPct,
  getContentWidthPct,
  getHeaderLeftInsetPct,
  APPEARANCE_EVENTS,
} from "@/hooks/use-appearance";

/**
 * Applies appearance CSS variables to the document root:
 *   --app-font-scale       : 1 + delta/100  (skipped on /steintavle)
 *   --app-content-width    : <pct>%         (100..150, default 100)
 *   --app-header-left-inset: <pct>vw        (0..50, default 0)
 */
export function AppearanceApplier() {
  const location = useLocation();
  const pathname = location.pathname;

  useEffect(() => {
    const apply = () => {
      const root = document.documentElement;
      const isSteintavle = pathname.startsWith("/steintavle");
      const fontDelta = isSteintavle ? 0 : getFontDeltaPct();
      const widthPct = getContentWidthPct();
      const headerInset = getHeaderLeftInsetPct();
      root.style.setProperty("--app-font-scale", String(1 + fontDelta / 100));
      // Tall (1.0 = 100%) — brukes til CSS zoom på hovedinnhold
      root.style.setProperty("--app-content-zoom", String(widthPct / 100));
      // Behold prosent-versjonen for evt. legacy bruk
      root.style.setProperty("--app-content-width", `${widthPct}%`);
      root.style.setProperty("--app-header-left-inset", `${headerInset}vw`);
    };
    apply();
    window.addEventListener(APPEARANCE_EVENTS.FONT_EVENT, apply);
    window.addEventListener(APPEARANCE_EVENTS.WIDTH_EVENT, apply);
    window.addEventListener(APPEARANCE_EVENTS.HEADER_INSET_EVENT, apply);
    return () => {
      window.removeEventListener(APPEARANCE_EVENTS.FONT_EVENT, apply);
      window.removeEventListener(APPEARANCE_EVENTS.WIDTH_EVENT, apply);
      window.removeEventListener(APPEARANCE_EVENTS.HEADER_INSET_EVENT, apply);
    };
  }, [pathname]);

  return null;
}
