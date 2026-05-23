export type StravaOwner = "arne" | "rebekka";

export const STRAVA_OWNERS: StravaOwner[] = ["arne", "rebekka"];

export function isStravaOwner(value: unknown): value is StravaOwner {
  return value === "arne" || value === "rebekka";
}

export function getStravaOwnerFromState(state: string | null): StravaOwner | null {
  const ownerPart = state?.split(".")[0];
  return isStravaOwner(ownerPart) ? ownerPart : null;
}

/**
 * Hver Strava-eier skal bruke sin egen Strava-app og sine egne secrets.
 * Rebekka faller ikke tilbake til Arne sine credentials.
 */
export function getStravaCredentials(owner: StravaOwner): {
  clientId: string | undefined;
  clientSecret: string | undefined;
} {
  if (owner === "rebekka") {
    return {
      clientId: process.env.STRAVA_CLIENT_ID_REBEKKA,
      clientSecret: process.env.STRAVA_CLIENT_SECRET_REBEKKA,
    };
  }
  return {
    clientId: process.env.STRAVA_CLIENT_ID,
    clientSecret: process.env.STRAVA_CLIENT_SECRET,
  };
}