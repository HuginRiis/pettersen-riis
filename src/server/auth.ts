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

    // ---- Rate limiting: bar the gate after too many failed attempts from one IP ----
    const ip = getCurrentRequestIp();
    if (ip) {
      const failures = await getRecentFailedAttemptsForIp(ip, LOCKOUT_WINDOW_MIN);
      if (failures >= LOCKOUT_THRESHOLD) {
        const last = await getLastFailedAttemptForIp(ip);
        const unlockAt = last
          ? new Date(last.getTime() + LOCKOUT_DURATION_MIN * 60 * 1000)
          : new Date(Date.now() + LOCKOUT_DURATION_MIN * 60 * 1000);
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
