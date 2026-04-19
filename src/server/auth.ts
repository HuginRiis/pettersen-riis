import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";

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
      throw new Error("Feil passord");
    }

    const session = await useSession<SessionData>(getSessionConfig());
    await session.update({ authenticated: true, loggedInAt: Date.now() });
    return { ok: true };
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<SessionData>(getSessionConfig());
  await session.clear();
  return { ok: true };
});
