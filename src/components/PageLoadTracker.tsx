import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCurrentWho } from "@/hooks/use-current-who";
import { logPageLoad } from "@/lib/page-load.functions";

function detectDevice(): { device: string; os: string; browser: string } {
  if (typeof navigator === "undefined") return { device: "Server", os: "?", browser: "?" };
  const ua = navigator.userAgent;
  let os = "Annet";
  if (/iPhone|iPod/.test(ua)) os = "iPhone";
  else if (/iPad/.test(ua)) os = "iPad";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Linux/.test(ua)) os = "Linux";

  let browser = "Annet";
  if (/CriOS/.test(ua)) browser = "Chrome iOS";
  else if (/FxiOS/.test(ua)) browser = "Firefox iOS";
  else if (/EdgiOS|Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua) && !/Edg/.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua) && !/Chrome|CriOS/.test(ua)) browser = "Safari";

  const isMobile = /iPhone|iPod|Android.*Mobile/.test(ua);
  const isTablet = /iPad|Android(?!.*Mobile)/.test(ua);
  const device = isMobile ? "Mobil" : isTablet ? "Nettbrett" : "Desktop";
  return { device: `${device} (${os})`, os, browser };
}

/**
 * Tracks how long each page takes to load on the client.
 * - First hit: uses Navigation Timing API (hard load).
 * - Subsequent route changes: measures time from route change start to next paint (SPA).
 */
export function PageLoadTracker() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const send = useServerFn(logPageLoad);
  const who = useCurrentWho();
  const startedRef = useRef<{ path: string; t: number } | null>(null);
  const firstLoadDoneRef = useRef(false);
  const lastSentRef = useRef<string>("");

  // Mark when a route change begins (path changes)
  useEffect(() => {
    startedRef.current = { path: pathname, t: performance.now() };
  }, [pathname]);

  // After render, measure time to next paint and send
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const submit = async (loadMs: number, kind: "hard" | "spa", ttfb?: number, dom?: number) => {
      const key = `${pathname}|${Math.round(performance.now() / 5000)}`;
      if (lastSentRef.current === key) return;
      lastSentRef.current = key;
      const { device, os, browser } = detectDevice();
      try {
        await send({
          data: {
            route: pathname || "/",
            who: who || "anon",
            device,
            os,
            browser,
            user_agent: navigator.userAgent.slice(0, 500),
            load_ms: Math.max(0, Math.round(loadMs)),
            ttfb_ms: ttfb != null ? Math.round(ttfb) : null,
            dom_ms: dom != null ? Math.round(dom) : null,
            kind,
          },
        });
      } catch { /* swallow */ }
    };

    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        if (cancelled) return;
        // First-ever effect → use Navigation Timing for accurate hard-load time
        if (!firstLoadDoneRef.current) {
          firstLoadDoneRef.current = true;
          const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
          if (nav) {
            const loadMs = nav.loadEventEnd > 0 ? nav.loadEventEnd : nav.domContentLoadedEventEnd;
            const ttfb = nav.responseStart;
            const dom = nav.domContentLoadedEventEnd;
            submit(loadMs, "hard", ttfb, dom);
            return;
          }
        }
        // SPA navigation
        const started = startedRef.current;
        if (started && started.path === pathname) {
          const elapsed = performance.now() - started.t;
          submit(elapsed, "spa");
        }
      });
      return () => cancelAnimationFrame(raf2);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
    };
  }, [pathname, who, send]);

  return null;
}
