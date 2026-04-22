import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  getWeeklyQuotaForIp,
  getRecentSearchesForIp,
  getLastVisitForIp,
  isHouseAuthenticated,
  logAiSearch,
  readClientIp,
  PUBLIC_WEEKLY_LIMIT,
  type RecentSearchRow,
} from "@/server/ai-usage.server";

// Beholdt for `requireHouseAuth` som brukes i reverseGeocode lenger nede.
type SessionData = { authenticated?: boolean };
function getSessionConfig() {
  const base = process.env.HOUSE_RIIS_PASSWORD ?? "";
  const derived = (base + "::house-riis-session-v1::winter-is-ours").repeat(4).slice(0, 64);
  return {
    password: derived,
    name: "house_riis_session",
    maxAge: 60 * 60 * 24 * 30,
    cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
  };
}
async function requireHouseAuth() {
  const session = await useSession<SessionData>(getSessionConfig());
  if (session.data?.authenticated !== true) {
    throw new Error("Du må logge inn på huset først.");
  }
}

// ── Validering ─────────────────────────────────────────────────────────
const inputSchema = z.object({
  location: z
    .string()
    .trim()
    .min(2, "Sted må ha minst 2 tegn")
    .max(120, "Sted er for langt"),
  category: z.enum(["fottur", "topptur", "sykkel", "bil"]),
});

export type RouteStep = {
  step: number;
  instruction: string;
};

export type TripSuggestion = {
  name: string;
  area: string;
  difficulty: "Lett" | "Middels" | "Krevende";
  duration: string;
  distanceKm: number | null;
  elevationGainM: number | null;
  highlights: string[];
  description: string;
  longDescription: string;
  startHint: string;
  startLat: number | null;
  startLon: number | null;
  endHint: string | null;
  routeSteps: RouteStep[];
  recommendedGear: string[];
  bestSeason: string;
  transport: string;
  parking: string;
  warnings: string[];
  facilities: string[];
  scenery: string;
};

export type TripResponse =
  | { ok: true; suggestions: TripSuggestion[]; locationLabel: string; category: string }
  | { ok: false; error: string };

// ── Server function ────────────────────────────────────────────────────
export const getTripSuggestions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<TripResponse> => {
    const authenticated = await isHouseAuthenticated();
    const model = "google/gemini-3-flash-preview";

    // Uinnloggede besøkende får 1 AI-søk per kalenderdøgn (UTC).
    if (!authenticated) {
      const ip = readClientIp();
      const limit = await canUseAiToday(ip);
      if (!limit.allowed) {
        await logAiSearch({
          feature: "turer",
          query: data.location,
          model,
          authenticated: false,
          status: "rate_limited",
        });
        return {
          ok: false,
          error:
            "Du har brukt dagens gratis AI-søk. Logg inn på huset for ubegrenset bruk, eller prøv igjen i morgen.",
        };
      }
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "AI-portalen er ikke konfigurert (mangler nøkkel)." };
    }

    const categoryLabel: Record<typeof data.category, string> = {
      fottur: "fotturer / vandring",
      topptur: "toppturer (fjelltopper, krevende dagsturer)",
      sykkel: "sykkelturer (terreng eller landevei)",
      bil: "bilturer / kjøreturer (naturskjønne strekninger og severdigheter langs veien)",
    };

    const systemPrompt = `Du er en kunnskapsrik norsk turguide som kjenner Norges natur, fjell, fjorder og kulturlandskap fra innerst i fjordene til Lofoten og Finnmark. Du svarer ALLTID på norsk (bokmål) i en lett episk, fortellerglad tone som passer en Game of Thrones-inspirert hjemmeside ("House Pettersen Riis of Skien"). Bruk gjerne uttrykk som "ferden", "raste", "stien", "jernhesten" (sykkel/bil), men hold informasjonen praktisk og korrekt. Ikke finn på steder — hold deg til reelle, kjente turmål.`;

    const userPrompt = `Foreslå 5 konkrete ${categoryLabel[data.category]} i nærheten av "${data.location}", Norge. Velg ekte, kjente turer i området (innen rimelig kjøreavstand for bil/sykkel, eller gangavstand for fotturer). Returner detaljert, strukturert data via verktøyet "return_trip_suggestions". Sørg for variasjon i vanskelighet og lengde. Inkluder ALLE feltene i skjemaet — særlig rute-steg (3-7 konkrete trinn), GPS-koordinater for startpunkt (Norge: lat ~58-71, lon ~4-31), anbefalt utstyr, beste sesong, transport og parkering. Vær så nøyaktig som mulig.`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_trip_suggestions",
                description: "Returnerer en strukturert liste med rike turforslag.",
                parameters: {
                  type: "object",
                  properties: {
                    suggestions: {
                      type: "array",
                      minItems: 3,
                      maxItems: 6,
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string", description: "Navnet på turen / målet" },
                          area: { type: "string", description: "Område / kommune / region" },
                          difficulty: {
                            type: "string",
                            enum: ["Lett", "Middels", "Krevende"],
                          },
                          duration: {
                            type: "string",
                            description: "Estimert tid, f.eks. '2-3 timer' eller 'halv dag'",
                          },
                          distanceKm: {
                            type: "number",
                            description: "Total lengde i km. Bruk 0 hvis ukjent.",
                          },
                          elevationGainM: {
                            type: "number",
                            description: "Høydemeter stigning totalt. Bruk 0 hvis flatt eller ukjent.",
                          },
                          highlights: {
                            type: "array",
                            items: { type: "string" },
                            minItems: 2,
                            maxItems: 5,
                            description: "Korte stikkord om hva som gjør turen verdt det",
                          },
                          description: {
                            type: "string",
                            description: "1-2 setninger kort sammendrag i episk tone.",
                          },
                          longDescription: {
                            type: "string",
                            description:
                              "3-6 setninger som beskriver turen i detalj — landskap, hva man ser, atmosfære. Lett episk tone.",
                          },
                          startHint: {
                            type: "string",
                            description: "Beskrivelse av startpunkt (sted, parkering, adresse)",
                          },
                          startLat: {
                            type: "number",
                            description: "Breddegrad for startpunkt (Norge: 58-71). Bruk 0 hvis ukjent.",
                          },
                          startLon: {
                            type: "number",
                            description: "Lengdegrad for startpunkt (Norge: 4-31). Bruk 0 hvis ukjent.",
                          },
                          endHint: {
                            type: "string",
                            description: "Beskrivelse av sluttpunkt hvis annerledes enn start (ellers tom streng).",
                          },
                          routeSteps: {
                            type: "array",
                            minItems: 3,
                            maxItems: 7,
                            items: {
                              type: "object",
                              properties: {
                                step: { type: "number", description: "Trinn-nummer (1, 2, 3...)" },
                                instruction: {
                                  type: "string",
                                  description: "Konkret instruksjon for dette trinnet av turen",
                                },
                              },
                              required: ["step", "instruction"],
                              additionalProperties: false,
                            },
                            description: "Steg-for-steg ruteveiledning fra start til mål.",
                          },
                          recommendedGear: {
                            type: "array",
                            items: { type: "string" },
                            minItems: 2,
                            maxItems: 8,
                            description: "Anbefalt utstyr (sko, klær, mat, kart osv.)",
                          },
                          bestSeason: {
                            type: "string",
                            description: "Beste tid på året, f.eks. 'Juni–september' eller 'Hele året'",
                          },
                          transport: {
                            type: "string",
                            description: "Hvordan komme seg dit (bil, buss, tog, fly + lokal transport)",
                          },
                          parking: {
                            type: "string",
                            description: "Parkeringsmuligheter ved start (gratis/avgift/begrenset)",
                          },
                          warnings: {
                            type: "array",
                            items: { type: "string" },
                            maxItems: 5,
                            description: "Advarsler — vær, terreng, dyreliv, sesongstenging osv.",
                          },
                          facilities: {
                            type: "array",
                            items: { type: "string" },
                            maxItems: 6,
                            description: "Fasiliteter underveis (toalett, hytter, vann, mat osv.)",
                          },
                          scenery: {
                            type: "string",
                            description: "Hva slags landskap dominerer (fjell, skog, kyst, kulturlandskap...)",
                          },
                        },
                        required: [
                          "name",
                          "area",
                          "difficulty",
                          "duration",
                          "distanceKm",
                          "elevationGainM",
                          "highlights",
                          "description",
                          "longDescription",
                          "startHint",
                          "startLat",
                          "startLon",
                          "endHint",
                          "routeSteps",
                          "recommendedGear",
                          "bestSeason",
                          "transport",
                          "parking",
                          "warnings",
                          "facilities",
                          "scenery",
                        ],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["suggestions"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "return_trip_suggestions" } },
        }),
      });

      if (res.status === 429) {
        await logAiSearch({
          feature: "turer",
          query: data.location,
          model,
          authenticated,
          status: "rate_limited",
        });
        return { ok: false, error: "AI-portalen tar imot for mange kall — prøv igjen om litt." };
      }
      if (res.status === 402) {
        await logAiSearch({
          feature: "turer",
          query: data.location,
          model,
          authenticated,
          status: "error",
        });
        return {
          ok: false,
          error: "AI-kreditten er brukt opp. Fyll på i Lovable Cloud-innstillingene.",
        };
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("AI gateway error:", res.status, txt.slice(0, 200));
        await logAiSearch({
          feature: "turer",
          query: data.location,
          model,
          authenticated,
          status: "error",
        });
        return { ok: false, error: `AI-portalen svarte med feil (${res.status}).` };
      }

      const json = await res.json();
      const usage = json?.usage ?? {};
      const promptTokens =
        typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : null;
      const completionTokens =
        typeof usage?.completion_tokens === "number"
          ? usage.completion_tokens
          : null;
      const totalTokens =
        typeof usage?.total_tokens === "number" ? usage.total_tokens : null;

      const toolCall = json?.choices?.[0]?.message?.tool_calls?.[0];
      const argsStr = toolCall?.function?.arguments;
      if (!argsStr) {
        await logAiSearch({
          feature: "turer",
          query: data.location,
          model,
          authenticated,
          status: "error",
          promptTokens,
          completionTokens,
          totalTokens,
        });
        return { ok: false, error: "Mesteren svarte uten et lesbart turforslag." };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(argsStr);
      } catch {
        await logAiSearch({
          feature: "turer",
          query: data.location,
          model,
          authenticated,
          status: "error",
          promptTokens,
          completionTokens,
          totalTokens,
        });
        return { ok: false, error: "Mesterens svar var ulesbart." };
      }
      const suggestions = (parsed as { suggestions?: TripSuggestion[] })?.suggestions ?? [];
      if (!Array.isArray(suggestions) || suggestions.length === 0) {
        await logAiSearch({
          feature: "turer",
          query: data.location,
          model,
          authenticated,
          status: "error",
          promptTokens,
          completionTokens,
          totalTokens,
        });
        return { ok: false, error: "Ingen turforslag funnet for dette området." };
      }
      // Normaliser tomme/nullverdier
      const cleaned: TripSuggestion[] = suggestions.map((s: any) => ({
        ...s,
        distanceKm: s.distanceKm && s.distanceKm > 0 ? s.distanceKm : null,
        elevationGainM: s.elevationGainM && s.elevationGainM > 0 ? s.elevationGainM : null,
        startLat:
          typeof s.startLat === "number" && s.startLat >= 57 && s.startLat <= 72
            ? s.startLat
            : null,
        startLon:
          typeof s.startLon === "number" && s.startLon >= 3 && s.startLon <= 32
            ? s.startLon
            : null,
        endHint: s.endHint && s.endHint.trim().length > 0 ? s.endHint : null,
        routeSteps: Array.isArray(s.routeSteps) ? s.routeSteps : [],
        recommendedGear: Array.isArray(s.recommendedGear) ? s.recommendedGear : [],
        warnings: Array.isArray(s.warnings) ? s.warnings : [],
        facilities: Array.isArray(s.facilities) ? s.facilities : [],
      }));
      await logAiSearch({
        feature: "turer",
        query: `${data.category}: ${data.location}`,
        model,
        authenticated,
        status: "ok",
        promptTokens,
        completionTokens,
        totalTokens,
      });
      return {
        ok: true,
        suggestions: cleaned,
        locationLabel: data.location,
        category: data.category,
      };
    } catch (e) {
      console.error("getTripSuggestions failed:", e);
      await logAiSearch({
        feature: "turer",
        query: data.location,
        model,
        authenticated,
        status: "error",
      });
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Ukjent feil ved henting av turforslag.",
      };
    }
  });

// ── Reverse-geocoding (gratis via OpenStreetMap Nominatim) ─────────────
const reverseSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export const reverseGeocode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => reverseSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true; label: string } | { ok: false; error: string }> => {
    await requireHouseAuth();
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${data.lat}&lon=${data.lon}&zoom=12&accept-language=no`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "house-pettersen-riis/1.0 (contact: arne@riis.cc)",
          Accept: "application/json",
        },
      });
      if (!res.ok) return { ok: false, error: `Stedsoppslag feilet (${res.status}).` };
      const j = (await res.json()) as {
        address?: Record<string, string>;
        display_name?: string;
      };
      const a = j.address ?? {};
      const place =
        a.city ||
        a.town ||
        a.village ||
        a.hamlet ||
        a.municipality ||
        a.county ||
        a.state ||
        j.display_name?.split(",")[0] ||
        "Ukjent sted";
      const region = a.county || a.state || "";
      const label = region && region !== place ? `${place}, ${region}` : place;
      return { ok: true, label };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Stedsoppslag feilet.",
      };
    }
  });
