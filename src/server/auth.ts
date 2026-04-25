import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import {
  logLoginAttempt,
  getFailedAttemptTimestampsForIp,
  getCurrentRequestIp,
} from "./visitors-log.server";

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
  return {
    password: derived,
    name: "house_riis_session",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none" as const,
      path: "/",
    },
  };
}

export const checkAuth = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<SessionData>(getSessionConfig());
  return { authenticated: session.data?.authenticated === true };
});

export const loginFn = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => {
    if (typeof data?.password !== "string" || data.password.length === 0 || data.password.length > 200) {
      throw new Error("Ugyldig passord");
    }
    return { password: data.password };
  })
  .handler(async ({ data }) => {
    const expected = process.env.HOUSE_RIIS_PASSWORD;
    if (!expected) {
      throw new Error("Server mangler passord-konfigurasjon");
    }

    // ---- Escalating rate-limit: 1st lockout = 1 min, 2nd = 15 min, 3rd+ = 60 min ----
    const ip = getCurrentRequestIp();
    if (ip) {
      const failures = await getFailedAttemptTimestampsForIp(ip, ESCALATION_LOOKBACK_HOURS);
      const episodes = detectLockoutEpisodes(failures);
      if (episodes.length > 0) {
        // The most recent episode determines the active lockout (if still pending)
        const lastEpisode = episodes[episodes.length - 1]!;
        // The episode count BEFORE this one tells us which escalation tier to use:
        // 1st episode → tier 0 (1 min), 2nd → tier 1 (15 min), 3rd+ → tier 2 (60 min)
        const tier = Math.min(episodes.length - 1, LOCKOUT_DURATIONS_MIN.length - 1);
        const durationMin = LOCKOUT_DURATIONS_MIN[tier]!;
        const unlockAt = new Date(lastEpisode.getTime() + durationMin * 60 * 1000);
        const remainingMs = unlockAt.getTime() - Date.now();
        if (remainingMs > 0) {
          const minutes = Math.max(1, Math.ceil(remainingMs / 60000));
          // Slow the response down a bit — adds friction to scripted attempts
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
      // Small delay to slow brute force
      await new Promise((r) => setTimeout(r, 400));
      await logLoginAttempt(false);
      throw new Error("Feil passord");
    }

    await logLoginAttempt(true);
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

  // Last successful login from this IP (excluding current session)
  try {
    if (ip) {
      const { data } = await supabaseAdmin
        .from("visitor_login_attempts" as any)
        .select("attempted_at")
        .eq("ip", ip)
        .eq("success", true)
        .order("attempted_at", { ascending: false })
        .limit(2);
      if (data && data.length > 0) {
        // If currently authenticated, the most recent record might be the current session — pick the second.
        const arr = data as any[];
        const pick = authenticated && arr.length > 1 ? arr[1] : arr[0];
        lastLoginAt = pick.attempted_at;
      }
    }
  } catch {
    /* ignore */
  }

  // Last visitor session (last_seen_at) — skip the CURRENT session so we show
  // the previous visit. Anything updated within the last 5 minutes is treated
  // as the active session.
  try {
    if (ip) {
      const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data } = await supabaseAdmin
        .from("visitor_sessions" as any)
        .select("last_seen_at")
        .eq("ip", ip)
        .lt("last_seen_at", cutoff)
        .order("last_seen_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        lastSeenAt = (data as any).last_seen_at;
      } else {
        // Fallback: no older session — show most recent regardless
        const { data: any2 } = await supabaseAdmin
          .from("visitor_sessions" as any)
          .select("last_seen_at")
          .eq("ip", ip)
          .order("last_seen_at", { ascending: false })
          .limit(2);
        if (any2 && any2.length > 1) lastSeenAt = (any2[1] as any).last_seen_at;
        else if (any2 && any2.length > 0) lastSeenAt = (any2[0] as any).last_seen_at;
      }
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
