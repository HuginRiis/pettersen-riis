import { useSession } from "@tanstack/react-start/server";

type SessionData = { authenticated?: boolean };

function getSessionConfig() {
  const base = process.env.HOUSE_RIIS_PASSWORD ?? "";
  const derived =
    (base + "::house-riis-session-v1::winter-is-ours").repeat(4).slice(0, 64);
  return {
    password: derived,
    name: "house_riis_session",
    maxAge: 60 * 60 * 24 * 30,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

export async function isHouseAuthenticated(): Promise<boolean> {
  try {
    const session = await useSession<SessionData>(getSessionConfig());
    return session.data?.authenticated === true;
  } catch {
    return false;
  }
}

export async function requireHouseAuth(): Promise<void> {
  const ok = await isHouseAuthenticated();
  if (!ok) throw new Error("Du må logge inn på huset først.");
}
