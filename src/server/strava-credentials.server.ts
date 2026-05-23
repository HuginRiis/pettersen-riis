import type { StravaOwner } from "@/lib/strava-shared";

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