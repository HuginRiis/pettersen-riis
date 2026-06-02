import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { startVisitorSession, recordPageview, heartbeat } from "@/lib/visitors.functions";
import { getStoredWho } from "@/lib/push-client";

const SESSION_KEY = "vakttarnet_client_session_id";

function readWho(): string | null {
  try {
    const w = getStoredWho();
    return w && w !== "Alle" ? w : null;
  } catch {
    return null;
  }
}

function getOrCreateClientSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const newId =
      "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(SESSION_KEY, newId);
    return newId;
  } catch {
    return "s_" + Math.random().toString(36).slice(2, 14);
  }
}

export function VisitorTracker() {
  const router = useRouterState();
  const pathname = router.location.pathname;

  const sessionIdRef = useRef<string | null>(null);
  const pageviewIdRef = useRef<string | null>(null);
  const sessionStartRef = useRef<number>(Date.now());
  const pageStartRef = useRef<number>(Date.now());
  const initialisedRef = useRef<boolean>(false);
  const lastPathRef = useRef<string>("");

  // Initialize on mount + register first pageview
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (initialisedRef.current) return;
    initialisedRef.current = true;

    const cid = getOrCreateClientSessionId();
    sessionStartRef.current = Date.now();
    pageStartRef.current = Date.now();
    lastPathRef.current = pathname;

    startVisitorSession({
      data: {
        clientSessionId: cid,
        referrer: document.referrer || null,
        language: navigator.language || null,
        screen: `${window.screen.width}x${window.screen.height}`,
        path: pathname,
        title: document.title || null,
        who: readWho(),
      },
    })
      .then((res) => {
        sessionIdRef.current = res.sessionId;
        pageviewIdRef.current = res.pageviewId;
      })
      .catch(() => {
        /* swallow */
      });
  }, [pathname]);

  // Track route changes (skip first since initial covers it)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!sessionIdRef.current) return;
    if (lastPathRef.current === pathname) return;

    // Flush previous pageview duration
    const prevDuration = Math.floor((Date.now() - pageStartRef.current) / 1000);
    if (pageviewIdRef.current) {
      heartbeat({
        data: {
          sessionId: sessionIdRef.current,
          pageviewId: pageviewIdRef.current,
          pageDurationSeconds: prevDuration,
          sessionDurationSeconds: Math.floor((Date.now() - sessionStartRef.current) / 1000),
          who: readWho(),
        },
      }).catch(() => {});
    }

    lastPathRef.current = pathname;
    pageStartRef.current = Date.now();

    recordPageview({
      data: {
        sessionId: sessionIdRef.current,
        path: pathname,
        title: document.title || null,
        who: readWho(),
      },
    })
      .then((res) => {
        pageviewIdRef.current = res.pageviewId;
      })
      .catch(() => {});
  }, [pathname]);

  // Heartbeat every 30s and on unload
  useEffect(() => {
    if (typeof window === "undefined") return;

    const tick = () => {
      if (!sessionIdRef.current) return;
      const now = Date.now();
      heartbeat({
        data: {
          sessionId: sessionIdRef.current,
          pageviewId: pageviewIdRef.current,
          pageDurationSeconds: Math.floor((now - pageStartRef.current) / 1000),
          sessionDurationSeconds: Math.floor((now - sessionStartRef.current) / 1000),
          who: readWho(),
        },
      }).catch(() => {});
    };

    const interval = window.setInterval(tick, 30_000);
    const onHide = () => tick();
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") tick();
    });

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
  }, []);

  return null;
}
