import { createServerFn } from "@tanstack/react-start";
import { useSession, getRequestHeader } from "@tanstack/react-start/server";

/**
 * Detect whether the current request is coming from an iframe (e.g. the
 * Lovable editor preview). When true, the session cookie must be SameSite=None
 * so the browser will store it as a third-party cookie.
 *
 * iOS Safari (iPad / iPhone) blokkerer SameSite=None-cookies hardt utenfor
 * iframe-kontekst, så på vanlig (top-level) navigasjon — inkl. publisert side
 * og preview åpnet i egen fane — bruker vi SameSite=Lax. Det er det som faktisk
 * fungerer på iPad/iPhone.
 */
function isIframeRequest(): boolean {
  try {
    const dest = getRequestHeader("sec-fetch-dest");
    const site = getRequestHeader("sec-fetch-site");
    if (dest === "iframe") return true;
    // Cross-site fetch from inside an iframe — fall back to None too.
    if (site === "cross-site") return true;
    return false;
  } catch {
    return false;
  }
}

// Rate-limit configuration — keep brute-forcers out of the gate.
const LOCKOUT_THRESHOLD = 5; // failed attempts inside the rolling window before a lockout episode triggers
const LOCKOUT_WINDOW_MIN = 15; // rolling window we count failures within
const ESCALATION_LOOKBACK_HOURS = 24; // how far back we look to count prior lockout episodes
// Escalating lockout durations (minutes) per episode within the lookback window.
// 1st lockout = 1 min, 2nd = 15 min, 3rd or more = 60 min.
const LOCKOUT_DURATIONS_MIN = [1, 15, 60] as const;

/**
 * Group failure timestamps into "lockout episodes". An episode is a cluster of
 * ≥ LOCKOUT_THRESHOLD failures inside any LOCKOUT_WINDOW_MIN window. We walk the
 * sorted timestamps once: each time we cross the threshold we mark an episode
 * starting at the threshold-th failure, then skip forward past that episode's
 * window before counting the next one. This lets us count distinct lockout
 * incidents instead of every failed click.
 *
 * Returns the start time of every detected episode (ascending).
 */
function detectLockoutEpisodes(failures: Date[]): Date[] {
  const episodes: Date[] = [];
  const windowMs = LOCKOUT_WINDOW_MIN * 60 * 1000;
  let i = 0;
  while (i < failures.length) {
    // Check if there's a window starting at i that contains ≥ THRESHOLD failures
    const windowEnd = failures[i]!.getTime() + windowMs;
    let j = i;
    while (j < failures.length && failures[j]!.getTime() <= windowEnd) j++;
    const count = j - i;
    if (count >= LOCKOUT_THRESHOLD) {
      // Episode triggered at the threshold-th failure
      const triggerIdx = i + LOCKOUT_THRESHOLD - 1;
      episodes.push(failures[triggerIdx]!);
      // Skip past the rest of this cluster so we don't double-count
      i = j;
    } else {
      i++;
    }
  }
  return episodes;
}


type SessionData = {
  authenticated?: boolean;
  loggedInAt?: number;
};

function getSessionConfig() {
  const base = process.env.HOUSE_RIIS_PASSWORD ?? "";
  // Derive a stable 64-char encryption key from the password so we don't need a separate secret
  const derived = (base + "::house-riis-session-v1::winter-is-ours").repeat(4).slice(0, 64);
  const inIframe = isIframeRequest();
  return {
    password: derived,
    name: "house_riis_session",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    cookie: {
      httpOnly: true,
      secure: true,
      // iOS Safari (iPad/iPhone) avviser SameSite=None i top-level kontekst
      // → bruk Lax når vi ikke er i en iframe. SameSite=None brukes kun for
      // Lovable editor-preview som vises i iframe.
      sameSite: (inIframe ? "none" : "lax") as "none" | "lax",
      path: "/",
    },
  };
}

export const checkAuth = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<SessionData>(getSessionConfig());
  return { authenticated: session.data?.authenticated === true };
});

export const loginFn = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string; who?: string | null }) => {
    if (typeof data?.password !== "string" || data.password.length === 0 || data.password.length > 200) {
      throw new Error("Ugyldig passord");
    }
    const who =
      typeof data?.who === "string" && data.who.trim().length > 0 && data.who.trim().length <= 40
        ? data.who.trim()
        : null;
    return { password: data.password, who };
  })
  .handler(async ({ data }) => {
    const expected = process.env.HOUSE_RIIS_PASSWORD;
    if (!expected) {
      throw new Error("Server mangler passord-konfigurasjon");
    }

    // ---- Escalating rate-limit: 1st lockout = 1 min, 2nd = 15 min, 3rd+ = 60 min ----
    const { logLoginAttempt, getFailedAttemptTimestampsForIp, getCurrentRequestIp } = await import("@/server/visitors-log.server");
    const ip = getCurrentRequestIp();
    if (ip) {
      const failures = await getFailedAttemptTimestampsForIp(ip, ESCALATION_LOOKBACK_HOURS);
      const episodes = detectLockoutEpisodes(failures);
      if (episodes.length > 0) {
        const lastEpisode = episodes[episodes.length - 1]!;
        const tier = Math.min(episodes.length - 1, LOCKOUT_DURATIONS_MIN.length - 1);
        const durationMin = LOCKOUT_DURATIONS_MIN[tier]!;
        const unlockAt = new Date(lastEpisode.getTime() + durationMin * 60 * 1000);
        const remainingMs = unlockAt.getTime() - Date.now();
        if (remainingMs > 0) {
          const minutes = Math.max(1, Math.ceil(remainingMs / 60000));
          await new Promise((r) => setTimeout(r, 800));
          throw new Error(
            `For mange feil-forsøk. Porten er stengt i ca. ${minutes} minutt${minutes === 1 ? "" : "er"}.`,
          );
        }
      }
    }


    // Constant-time-ish comparison
    const a = Buffer.from(data.password);
    const b = Buffer.from(expected);
    let ok = a.length === b.length;
    const len = Math.max(a.length, b.length);
    let diff = a.length ^ b.length;
    for (let i = 0; i < len; i++) {
      diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    }
    ok = ok && diff === 0;

    if (!ok) {
      await new Promise((r) => setTimeout(r, 400));
      await logLoginAttempt(false, data.who);
      throw new Error("Feil passord");
    }

    await logLoginAttempt(true, data.who);
    const session = await useSession<SessionData>(getSessionConfig());
    await session.update({ authenticated: true, loggedInAt: Date.now() });
    return { ok: true };
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<SessionData>(getSessionConfig());
  await session.clear();
  return { ok: true };
});

/**
 * Returns welcome info for the dialog:
 *  - who: navnet fra push-abonnement på denne IP-en (om noen), ellers null
 *  - lastLoginAt: forrige vellykkede innlogging fra denne IP-en
 *  - lastSeenAt: forrige bes\u00f8k (visitor session) fra denne IP-en
 *  - authenticated: om sesjonen er aktiv
 */
export const getWelcomeInfo = createServerFn({ method: "POST" })
  .inputValidator((input?: { endpoint?: string | null; storedWho?: string | null } | undefined) => {
    const endpoint =
      typeof input?.endpoint === "string" && input.endpoint.length > 10 && input.endpoint.length <= 2000
        ? input.endpoint
        : null;
    const storedWho =
      typeof input?.storedWho === "string" && input.storedWho.length > 0 && input.storedWho.length <= 40
        ? input.storedWho
        : null;
    return { endpoint, storedWho };
  })
  .handler(async ({ data }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getCurrentRequestIp } = await import("@/server/visitors-log.server");
  const ip = getCurrentRequestIp();
  const session = await useSession<SessionData>(getSessionConfig());
  const authenticated = session.data?.authenticated === true;

  let who: string | null = null;
  let lastLoginAt: string | null = null;
  let lastSeenAt: string | null = null;

  // 1) Most precise: the push subscription registered on THIS device (matched by endpoint).
  if (data.endpoint) {
    try {
      const { data: sub } = await supabaseAdmin
        .from("push_subscriptions" as any)
        .select("who")
        .eq("endpoint", data.endpoint)
        .maybeSingle();
      if (sub && (sub as any).who && (sub as any).who !== "Alle") {
        who = (sub as any).who as string;
      }
    } catch {
      /* ignore */
    }
  }

  // 2) Fallback: localStorage value from this browser ("agenda_push_who")
  if (!who && data.storedWho && data.storedWho !== "Alle") {
    who = data.storedWho;
  }

  // 3) Fallback: explicit IP→user mapping
  if (!who) {
    try {
      if (ip) {
        const { data: mapping } = await supabaseAdmin
          .from("ip_user_mapping" as any)
          .select("who")
          .eq("ip", ip)
          .maybeSingle();
        if (mapping && (mapping as any).who) who = (mapping as any).who as string;
      }
    } catch {
      /* ignore */
    }
  }

  // Last successful login — most recent for this person (matched by `who`),
  // falling back to IP. We always show the latest entry, including the
  // current session, so "I logged in just now" is reflected.
  try {
    if (who) {
      const { data } = await supabaseAdmin
        .from("visitor_login_attempts" as any)
        .select("attempted_at")
        .eq("who", who)
        .eq("success", true)
        .order("attempted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) lastLoginAt = (data as any).attempted_at;
    }
    if (!lastLoginAt && ip) {
      const { data } = await supabaseAdmin
        .from("visitor_login_attempts" as any)
        .select("attempted_at")
        .eq("ip", ip)
        .eq("success", true)
        .order("attempted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) lastLoginAt = (data as any).attempted_at;
    }
  } catch {
    /* ignore */
  }

  // Last visit — most recent activity that is NOT the live/current session.
  // We use a small 2-minute cutoff to exclude the heartbeat that just fired,
  // but still show "earlier today" visits. We look across all sessions tied
  // to this person (via `who`) AND any sessions on the current IP (which
  // catches anonymous sessions from the same device that haven't been
  // identified yet — common on dynamic mobile IPv6).
  try {
    const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const candidates: string[] = [];

    if (who) {
      const { data } = await supabaseAdmin
        .from("visitor_sessions" as any)
        .select("last_seen_at")
        .eq("who", who)
        .lt("last_seen_at", cutoff)
        .order("last_seen_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) candidates.push((data as any).last_seen_at);
    }
    if (ip) {
      const { data } = await supabaseAdmin
        .from("visitor_sessions" as any)
        .select("last_seen_at")
        .eq("ip", ip)
        .lt("last_seen_at", cutoff)
        .order("last_seen_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) candidates.push((data as any).last_seen_at);
    }

    // Pick the most recent of the candidates.
    if (candidates.length > 0) {
      lastSeenAt = candidates.sort().reverse()[0] ?? null;
    }
  } catch {
    /* ignore */
  }

  return {
    authenticated,
    who,
    ip: ip ?? null,
    lastLoginAt,
    lastSeenAt,
  };
});
