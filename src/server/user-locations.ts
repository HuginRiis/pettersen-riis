import { createServerFn } from "@tanstack/react-start";
const __loadAdmin = createIsomorphicFn()
  .server((): Promise<typeof import("@/integrations/supabase/client.server")> =>
    import("@/integrations/supabase/client.server"),
  )
  .client(
    (): Promise<typeof import("@/integrations/supabase/client.server")> =>
      Promise.resolve({ supabaseAdmin: null } as unknown as typeof import("@/integrations/supabase/client.server")),
  );
const { supabaseAdmin } = await __loadAdmin();
import { getCurrentRequestIp } from "./visitors-log.server";

export type WhoName = "Arne" | "Rebekka" | string;
export type LocationPage = "var" | "pollen";

export type SavedLocation = {
  who: WhoName;
  page: LocationPage;
  place_label: string;
  lat: number;
  lon: number;
};

// Default fallback when no preference exists yet
const FALLBACK = {
  place_label: "Tollnes, Skien",
  lat: 59.2096,
  lon: 9.609,
};

/**
 * Lookup the most recent name (Arne/Rebekka) chosen from the caller's IP.
 * Returns null if the IP has never picked a name.
 */
export const getNameForCurrentIp = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ who: WhoName | null; ip: string | null }> => {
    const ip = getCurrentRequestIp();
    if (!ip) return { who: null, ip: null };
    const { data } = await supabaseAdmin
      .from("ip_user_mapping" as any)
      .select("who")
      .eq("ip", ip)
      .maybeSingle();
    return { who: (data as any)?.who ?? null, ip };
  },
);

/**
 * Persist the active name for the caller's IP so future visits remember it.
 */
export const setNameForCurrentIp = createServerFn({ method: "POST" })
  .inputValidator((input: { who: string }) => {
    const who = String(input?.who ?? "").trim();
    if (!who || who.length > 50) throw new Error("Ugyldig navn");
    return { who };
  })
  .handler(async ({ data }) => {
    const ip = getCurrentRequestIp();
    if (!ip) return { ok: false as const, error: "Ingen IP funnet" };
    await supabaseAdmin
      .from("ip_user_mapping" as any)
      .upsert(
        { ip, who: data.who, updated_at: new Date().toISOString() },
        { onConflict: "ip" },
      );
    return { ok: true as const };
  });

/**
 * Fetch the default place for (who, current IP, page).
 * If no row exists, return FALLBACK so the page still has Tollnes.
 */
export const getDefaultLocation = createServerFn({ method: "GET" })
  .inputValidator((input: { who: string; page: string }) => {
    const who = String(input?.who ?? "").trim();
    const page = String(input?.page ?? "").trim();
    if (!who) throw new Error("Mangler navn");
    if (page !== "var" && page !== "pollen") throw new Error("Ugyldig side");
    return { who, page: page as LocationPage };
  })
  .handler(async ({ data }) => {
    const ip = getCurrentRequestIp();
    if (!ip) {
      return {
        who: data.who,
        page: data.page,
        place_label: FALLBACK.place_label,
        lat: FALLBACK.lat,
        lon: FALLBACK.lon,
        isFallback: true,
      };
    }
    const { data: row } = await supabaseAdmin
      .from("user_location_prefs" as any)
      .select("place_label,lat,lon")
      .eq("who", data.who)
      .eq("ip", ip)
      .eq("page", data.page)
      .maybeSingle();
    if (row) {
      return {
        who: data.who,
        page: data.page,
        place_label: (row as any).place_label,
        lat: (row as any).lat,
        lon: (row as any).lon,
        isFallback: false,
      };
    }
    return {
      who: data.who,
      page: data.page,
      place_label: FALLBACK.place_label,
      lat: FALLBACK.lat,
      lon: FALLBACK.lon,
      isFallback: true,
    };
  });

/**
 * Save a new default place for (who, current IP, page). Upserts on conflict.
 */
export const setDefaultLocation = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      who: string;
      page: string;
      place_label: string;
      lat: number;
      lon: number;
    }) => {
      const who = String(input?.who ?? "").trim();
      const page = String(input?.page ?? "").trim();
      const place_label = String(input?.place_label ?? "").trim();
      if (!who || who.length > 50) throw new Error("Ugyldig navn");
      if (page !== "var" && page !== "pollen") throw new Error("Ugyldig side");
      if (!place_label || place_label.length > 200) throw new Error("Ugyldig sted");
      const lat = Number(input?.lat);
      const lon = Number(input?.lon);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error("Ugyldig lat");
      if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error("Ugyldig lon");
      return { who, page: page as LocationPage, place_label, lat, lon };
    },
  )
  .handler(async ({ data }) => {
    const ip = getCurrentRequestIp();
    if (!ip) return { ok: false as const, error: "Ingen IP funnet" };
    await supabaseAdmin
      .from("user_location_prefs" as any)
      .upsert(
        {
          who: data.who,
          ip,
          page: data.page,
          place_label: data.place_label,
          lat: data.lat,
          lon: data.lon,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "who,ip,page" },
      );
    // Also remember the name for this IP so future loads default to it
    await supabaseAdmin
      .from("ip_user_mapping" as any)
      .upsert(
        { ip, who: data.who, updated_at: new Date().toISOString() },
        { onConflict: "ip" },
      );
    return { ok: true as const };
  });

// ─────────────────────────────────────────────────────────────────────
// Kartverket place search (norske stedsnavn — gratis, krever ingen nøkkel)
// https://ws.geonorge.no/stedsnavn/v1/sted
// ─────────────────────────────────────────────────────────────────────

export type PlaceHit = {
  label: string;        // "Tollnes, Skien"
  full: string;         // raw skrivemåte
  kommune: string;
  fylke: string;
  type: string;         // "Tettsted", "Bydel", osv.
  lat: number;
  lon: number;
};

export const searchPlaces = createServerFn({ method: "GET" })
  .inputValidator((input: { q: string }) => {
    const q = String(input?.q ?? "").trim();
    if (!q || q.length < 2 || q.length > 80) throw new Error("Søk må være 2–80 tegn");
    return { q };
  })
  .handler(async ({ data }): Promise<{ hits: PlaceHit[] }> => {
    try {
      const url = new URL("https://ws.geonorge.no/stedsnavn/v1/navn");
      url.searchParams.set("sok", data.q + "*");
      url.searchParams.set("treffPerSide", "12");
      url.searchParams.set("utkoordsys", "4258"); // EPSG:4258 = lat/lon WGS84-ekvivalent
      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return { hits: [] };
      const json = (await res.json()) as any;
      const navn: any[] = Array.isArray(json?.navn) ? json.navn : [];
      const hits: PlaceHit[] = [];
      const seen = new Set<string>();
      for (const n of navn) {
        const lat = n?.representasjonspunkt?.nord;
        const lon = n?.representasjonspunkt?.øst;
        if (typeof lat !== "number" || typeof lon !== "number") continue;
        const skriv = String(n?.skrivemåte ?? "").trim();
        if (!skriv) continue;
        const kommuner: any[] = Array.isArray(n?.kommuner) ? n.kommuner : [];
        const kommune = kommuner[0]?.kommunenavn ?? "";
        const fylker: any[] = Array.isArray(n?.fylker) ? n.fylker : [];
        const fylke = fylker[0]?.fylkesnavn ?? "";
        const type = String(n?.navneobjekttype ?? "");
        const label = kommune ? `${skriv}, ${kommune}` : skriv;
        const dedupKey = `${label}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        hits.push({ label, full: skriv, kommune, fylke, type, lat, lon });
        if (hits.length >= 10) break;
      }
      return { hits };
    } catch {
      return { hits: [] };
    }
  });

/**
 * Reverse-geocoder lat/lon og returnerer nærmeste by/tettsted.
 * Bruker BigDataCloud (gratis, ingen nøkkel) som primær — mer presis enn Kartverket
 * for "hvilken by er jeg i". Faller tilbake til Nominatim på by-nivå.
 */
export const reverseGeocode = createServerFn({ method: "POST" })
  .inputValidator((input: { lat: number; lon: number }) => {
    const lat = Number(input?.lat);
    const lon = Number(input?.lon);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error("Ugyldig lat");
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error("Ugyldig lon");
    return { lat, lon };
  })
  .handler(async ({ data }): Promise<{ label: string; lat: number; lon: number }> => {
    // Hjelpefunksjon: avstand i km mellom to lat/lon-punkter (haversine).
    const distKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371;
      const toRad = (d: number) => (d * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(a));
    };

    // ── Strategi 1: Open-Meteo geocoding "search" gir ekte byer/tettsteder
    //    med koordinater. Vi henter en haug rundt punktet og velger nærmeste
    //    populerte sted. Dette er det samme datasettet (GeoNames) som mange
    //    værtjenester bruker, så MET.no/pollen-dekningen er god.
    //    Ingen API-nøkkel kreves.
    try {
      // Først: be Nominatim om byen vi er i, slik at vi får riktig søkeord.
      const nUrl = new URL("https://nominatim.openstreetmap.org/reverse");
      nUrl.searchParams.set("lat", String(data.lat));
      nUrl.searchParams.set("lon", String(data.lon));
      nUrl.searchParams.set("format", "jsonv2");
      nUrl.searchParams.set("zoom", "10"); // by/kommune-nivå
      nUrl.searchParams.set("accept-language", "nb,no,en");
      const nRes = await fetch(nUrl.toString(), {
        headers: {
          Accept: "application/json",
          "User-Agent": "pettersen-riis-vakttaarn/1.0 (https://arne.riis.cc)",
        },
        signal: AbortSignal.timeout(6000),
      });
      if (nRes.ok) {
        const nJson = (await nRes.json()) as any;
        const a = nJson?.address ?? {};
        const cityName: string =
          a.city || a.town || a.municipality || a.village || a.county || "";
        const region: string = a.county || a.state || "";
        if (cityName) {
          // Snap til byens sentrum via Open-Meteo geocoding
          try {
            const gUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
            gUrl.searchParams.set("name", cityName);
            gUrl.searchParams.set("count", "10");
            gUrl.searchParams.set("language", "no");
            gUrl.searchParams.set("countryCode", a.country_code?.toUpperCase() || "NO");
            const { fetchWithBackoff } = await import("./open-meteo-cache.server");
            const gRes = await fetchWithBackoff("geoip", "open-meteo:geocoding", gUrl.toString(), {
              headers: { Accept: "application/json" },
              signal: AbortSignal.timeout(6000),
            });
            if (gRes?.ok) {
              const gJson = (await gRes.json()) as any;
              const results: any[] = Array.isArray(gJson?.results) ? gJson.results : [];
              // Velg det treffet som er nærmest GPS-punktet
              const ranked = results
                .map((r) => ({
                  r,
                  d: distKm(data.lat, data.lon, Number(r.latitude), Number(r.longitude)),
                }))
                .sort((x, y) => x.d - y.d);
              const best = ranked[0]?.r;
              if (best && Number.isFinite(best.latitude) && Number.isFinite(best.longitude)) {
                const lat = Number(best.latitude);
                const lon = Number(best.longitude);
                const admin = best.admin1 || region || "";
                const name = String(best.name || cityName);
                const label =
                  admin && admin.toLowerCase() !== name.toLowerCase()
                    ? `${name}, ${admin}`
                    : name;
                return { label, lat, lon };
              }
            }
          } catch {
            // fall through
          }

          // Hvis Open-Meteo ikke fant noe, bruk Nominatim sitt eget koordinat
          const snapLat = Number(nJson?.lat);
          const snapLon = Number(nJson?.lon);
          const lat = Number.isFinite(snapLat) ? snapLat : data.lat;
          const lon = Number.isFinite(snapLon) ? snapLon : data.lon;
          const label =
            region && region.toLowerCase() !== cityName.toLowerCase()
              ? `${cityName}, ${region}`
              : cityName;
          return { label, lat, lon };
        }
      }
    } catch {
      // fall through to BigDataCloud
    }

    // ── Strategi 2: BigDataCloud — gratis, ingen nøkkel, gir city/locality.
    try {
      const bUrl = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
      bUrl.searchParams.set("latitude", String(data.lat));
      bUrl.searchParams.set("longitude", String(data.lon));
      bUrl.searchParams.set("localityLanguage", "no");
      const bRes = await fetch(bUrl.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      });
      if (bRes.ok) {
        const bJson = (await bRes.json()) as any;
        const city: string =
          bJson?.city ||
          bJson?.locality ||
          bJson?.localityInfo?.administrative?.[3]?.name ||
          bJson?.principalSubdivision ||
          "";
        const region: string = bJson?.principalSubdivision || "";
        if (city) {
          const label =
            region && region.toLowerCase() !== city.toLowerCase()
              ? `${city}, ${region}`
              : city;
          return { label, lat: data.lat, lon: data.lon };
        }
      }
    } catch {
      // fall through
    }

    // Siste utvei: rå koordinater
    return {
      label: `${data.lat.toFixed(4)}°N ${data.lon.toFixed(4)}°Ø`,
      lat: data.lat,
      lon: data.lon,
    };
  });
