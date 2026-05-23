export type StravaOwner = "arne" | "rebekka";

export const STRAVA_OWNERS: StravaOwner[] = ["arne", "rebekka"];

export function isStravaOwner(value: unknown): value is StravaOwner {
  return value === "arne" || value === "rebekka";
}

export function getStravaOwnerFromState(state: string | null): StravaOwner | null {
  const ownerPart = state?.split(".")[0];
  return isStravaOwner(ownerPart) ? ownerPart : null;
}