import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import {
  getFontDeltaPct,
  getContentWidthPct,
  APPEARANCE_EVENTS,
} from "@/hooks/use-appearance";

/**
 * Applies font scale & content width to the document root by setting CSS variables:
 *   --app-font-scale: 1 + delta/100  (1.0 default; skipped on /steintavle)
 *   --app-content-width: <pct>%       (defaults to 100%)
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
      root.style.setProperty("--app-font-scale", String(1 + fontDelta / 100));
      root.style.setProperty("--app-content-width", `${widthPct}%`);
    };
    apply();
    window.addEventListener(APPEARANCE_EVENTS.FONT_EVENT, apply);
    window.addEventListener(APPEARANCE_EVENTS.WIDTH_EVENT, apply);
    return () => {
      window.removeEventListener(APPEARANCE_EVENTS.FONT_EVENT, apply);
      window.removeEventListener(APPEARANCE_EVENTS.WIDTH_EVENT, apply);
    };
  }, [pathname]);

  return null;
}
