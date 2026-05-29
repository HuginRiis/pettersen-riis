import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Henter NAAFs offisielle pollenvarsel (manuelt satt av forskere) ved å
 * skrape den offentlige Next.js-iframen `pollenvarsel.naaf.no/charts/forecast`.
 *
 * NAAF gir én verdi per dag per region (0–4 skala). Dette komplementerer
 * Open-Meteos time-for-time prognose: NAAF er bakkesannhet for regionnivå,
 * Open-Meteo gir time-for-time-presisjon for valgt koordinat.
 *
 * Skalaen NAAF bruker:
 *   0 = ingen, 1 = lav, 2 = moderat, 3 = høy, 4 = svært høy
 *
 * Regioner: ostlandetMedOslo, sorlandet, rogaland, hordaland, sognOgFjordane,
 * moreOgRomsdal, indreOstlandet, sentraleFjellstrokISorNorge, trondelag,
 * nordland, troms, finnmark.
 */
export const getNaafForecast = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z
      .object({
        region: z.string().min(1).max(64).regex(/^[a-zA-Z]+$/),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const res = await fetch("https://pollenvarsel.naaf.no/charts/forecast", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HousePettersenRiis/1.0)" },
    });
    if (!res.ok) throw new Error(`NAAF svarte ${res.status}`);
    const html = await res.text();

    const m = html.match(/__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) throw new Error("Fant ikke NAAF-data i HTML");

    let parsed: any;
    try {
      parsed = JSON.parse(m[1]);
    } catch {
      throw new Error("Kunne ikke parse NAAF JSON");
    }

    const forecastData: Array<{
      date: string;
      regions: Array<{ id: string; pollen: Record<string, number> }>;
    }> = parsed?.props?.pageProps?.data?.forecastData ?? [];

    const regionsData: Array<{ id: string; expiryDate: string; textForecast: string }> =
      parsed?.props?.pageProps?.data?.regionsData ?? [];

    const days = forecastData.map((d) => {
      const r = d.regions.find((x) => x.id === data.region);
      return { date: d.date, pollen: r?.pollen ?? {} };
    });

    const text = regionsData.find((r) => r.id === data.region)?.textForecast ?? null;

    return {
      region: data.region,
      days,
      textForecast: text,
      fetchedAt: new Date().toISOString(),
    };
  });
