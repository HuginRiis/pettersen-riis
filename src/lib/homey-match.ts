/**
 * Fuzzy device-finder for Homey snapshots.
 *
 * Splits the needle into tokens and finds the first device whose
 * (name + " " + zoneName) contains ALL tokens (case/space insensitive).
 * Falls back to substring of full name. Returns null if nothing matches.
 */
export function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export type DeviceLike = {
  id: string;
  name: string;
  zone?: string | null;
  capabilities: Record<string, { value: any }>;
};

export type ZoneLike = { id: string; name: string };

export function findDeviceFuzzy<T extends DeviceLike>(
  devices: T[],
  zones: ZoneLike[],
  needle: string,
  filter?: (d: T, combined: string) => boolean,
): T | null {
  const zoneById = new Map(zones.map((z) => [z.id, z.name]));
  const tokens = norm(needle).split(" ").filter(Boolean);
  if (tokens.length === 0) return null;

  const candidates = devices.map((d) => {
    const zoneName = d.zone ? zoneById.get(d.zone) ?? "" : "";
    const combined = norm(`${d.name} ${zoneName}`);
    return { d, combined };
  });

  // 1. ALL tokens present + custom filter (if any)
  const allMatch = candidates.find(
    ({ d, combined }) =>
      tokens.every((t) => combined.includes(t)) && (filter ? filter(d, combined) : true),
  );
  if (allMatch) return allMatch.d;

  // 2. Substring of full name only
  const sub = candidates.find(({ combined }) => combined.includes(norm(needle)));
  if (sub) return sub.d;

  return null;
}

export function readTemp(d: DeviceLike | null | undefined): number | null {
  const v = d?.capabilities["measure_temperature"]?.value;
  return typeof v === "number" ? v : null;
}
