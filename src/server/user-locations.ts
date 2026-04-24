import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
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
 * Reverse-geocoder lat/lon mot Kartverkets stedsregister og returnerer
 * det nærmeste navnet (typisk tettsted/bydel/grend). Brukes til "Min plassering"-knappen.
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
    // Hent ut beste skrivemåte fra stedsnavn-arrayen (foretrekk hovednavn på norsk)
    const extractName = (n: any): string => {
      const arr: any[] = Array.isArray(n?.stedsnavn) ? n.stedsnavn : [];
      const hoved = arr.find(
        (s) =>
          String(s?.navnestatus ?? "").toLowerCase() === "hovednavn" &&
          String(s?.språk ?? "").toLowerCase().startsWith("norsk"),
      );
      if (hoved?.skrivemåte) return String(hoved.skrivemåte).trim();
      const anyHoved = arr.find(
        (s) => String(s?.navnestatus ?? "").toLowerCase() === "hovednavn",
      );
      if (anyHoved?.skrivemåte) return String(anyHoved.skrivemåte).trim();
      const first = arr.find((s) => s?.skrivemåte);
      return first?.skrivemåte ? String(first.skrivemåte).trim() : "";
    };

    // Bare bebodde steder — disse har god dekning i MET.no og pollenvarsel.
    // Rangert fra mest til minst foretrukket.
    const POPULATED = ["tettsted", "by", "tettbebyggelse", "bydel", "grend"];
    const isPopulated = (n: any) => {
      const t = String(n?.navneobjekttype ?? "").toLowerCase();
      return POPULATED.some((x) => t.includes(x));
    };
    const populatedRank = (n: any) => {
      const t = String(n?.navneobjekttype ?? "").toLowerCase();
      const p = POPULATED.findIndex((x) => t.includes(x));
      return p === -1 ? 99 : p;
    };

    // Søk Kartverket med stadig større radius til vi finner et bebodd sted.
    // Returnerer tettstedets eget koordinat (snapper til sentrum), ikke GPS-punktet.
    for (const radius of [3000, 8000, 20000]) {
      try {
        const url = new URL("https://ws.geonorge.no/stedsnavn/v1/punkt");
        url.searchParams.set("nord", String(data.lat));
        url.searchParams.set("ost", String(data.lon));
        url.searchParams.set("koordsys", "4258");
        url.searchParams.set("radius", String(radius));
        url.searchParams.set("treffPerSide", "50");
        url.searchParams.set("utkoordsys", "4258");
        const res = await fetch(url.toString(), {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) continue;
        const json = (await res.json()) as any;
        const navn: any[] = Array.isArray(json?.navn) ? json.navn : [];

        const populated = navn
          .filter((n) => isPopulated(n) && extractName(n))
          .sort((a, b) => {
            // Først: foretrukket type (tettsted før bydel før grend)
            const ra = populatedRank(a);
            const rb = populatedRank(b);
            if (ra !== rb) return ra - rb;
            // Så: nærmest GPS-punktet
            const da = Number(a?.meterFraPunkt ?? 1e9);
            const db = Number(b?.meterFraPunkt ?? 1e9);
            return da - db;
          });

        const best = populated[0];
        if (best) {
          const skriv = extractName(best);
          const kommune = String(best?.kommuner?.[0]?.kommunenavn ?? "").trim();
          // Snap til stedets eget koordinat (sentrum av tettstedet)
          const snapLat = Number(best?.representasjonspunkt?.nord);
          const snapLon = Number(best?.representasjonspunkt?.øst);
          const lat = Number.isFinite(snapLat) ? snapLat : data.lat;
          const lon = Number.isFinite(snapLon) ? snapLon : data.lon;
          const label =
            kommune && kommune.toLowerCase() !== skriv.toLowerCase()
              ? `${skriv}, ${kommune}`
              : skriv;
          return { label, lat, lon };
        }
      } catch {
        // prøv neste radius
      }
    }

    // Fallback: OpenStreetMap Nominatim (utenfor Norge eller hvis Kartverket feiler).
    // zoom=12 = town/city nivå — gir nærmeste by/tettsted, ikke gateadresse.
    try {
      const nUrl = new URL("https://nominatim.openstreetmap.org/reverse");
      nUrl.searchParams.set("lat", String(data.lat));
      nUrl.searchParams.set("lon", String(data.lon));
      nUrl.searchParams.set("format", "jsonv2");
      nUrl.searchParams.set("zoom", "12"); // by/tettsted-nivå
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
        const place =
          a.city ||
          a.town ||
          a.village ||
          a.hamlet ||
          a.suburb ||
          a.neighbourhood ||
          a.municipality ||
          a.county ||
          "";
        const region = a.county || a.state || a.municipality || "";
        // Snap til sentrum hvis Nominatim oppgir det
        const snapLat = Number(nJson?.lat);
        const snapLon = Number(nJson?.lon);
        const lat = Number.isFinite(snapLat) ? snapLat : data.lat;
        const lon = Number.isFinite(snapLon) ? snapLon : data.lon;
        let label = "";
        if (place && region && place.toLowerCase() !== region.toLowerCase()) {
          label = `${place}, ${region}`;
        } else if (place) {
          label = place;
        } else if (nJson?.display_name) {
          label = String(nJson.display_name).split(",").slice(0, 2).join(", ").trim();
        }
        if (label) return { label, lat, lon };
      }
    } catch {
      // fall through to coordinates
    }

    return {
      label: `${data.lat.toFixed(4)}°N ${data.lon.toFixed(4)}°Ø`,
      lat: data.lat,
      lon: data.lon,
    };
  });
