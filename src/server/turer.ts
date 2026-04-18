import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { z } from "zod";

// ── House auth gate (samme mønster som de andre serverfunksjonene) ──
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

export type TripSuggestion = {
  name: string;
  area: string;
  difficulty: "Lett" | "Middels" | "Krevende";
  duration: string;
  distanceKm: number | null;
  highlights: string[];
  description: string;
  startHint: string;
};

export type TripResponse =
  | { ok: true; suggestions: TripSuggestion[]; locationLabel: string; category: string }
  | { ok: false; error: string };

// ── Server function ────────────────────────────────────────────────────
export const getTripSuggestions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<TripResponse> => {
    await requireHouseAuth();

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

    const userPrompt = `Foreslå 5 konkrete ${categoryLabel[data.category]} i nærheten av "${data.location}", Norge. Velg ekte, kjente turer i området (innen rimelig kjøreavstand for bil/sykkel, eller gangavstand for fotturer). Returner strukturert data via verktøyet "return_trip_suggestions". Sørg for variasjon i vanskelighet og lengde.`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_trip_suggestions",
                description: "Returnerer en strukturert liste med turforslag.",
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
                            description: "Total lengde i km (rundtur eller tur/retur). Bruk 0 hvis ukjent.",
                          },
                          highlights: {
                            type: "array",
                            items: { type: "string" },
                            minItems: 2,
                            maxItems: 4,
                            description: "Korte stikkord om hva som gjør turen verdt det",
                          },
                          description: {
                            type: "string",
                            description:
                              "1-3 setninger som beskriver turen i en lett episk, fortellerglad tone.",
                          },
                          startHint: {
                            type: "string",
                            description:
                              "Hvordan komme til startpunkt (parkering, transport eller adresse)",
                          },
                        },
                        required: [
                          "name",
                          "area",
                          "difficulty",
                          "duration",
                          "distanceKm",
                          "highlights",
                          "description",
                          "startHint",
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
        return { ok: false, error: "AI-portalen tar imot for mange kall — prøv igjen om litt." };
      }
      if (res.status === 402) {
        return {
          ok: false,
          error: "AI-kreditten er brukt opp. Fyll på i Lovable Cloud-innstillingene.",
        };
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("AI gateway error:", res.status, txt.slice(0, 200));
        return { ok: false, error: `AI-portalen svarte med feil (${res.status}).` };
      }

      const json = await res.json();
      const toolCall = json?.choices?.[0]?.message?.tool_calls?.[0];
      const argsStr = toolCall?.function?.arguments;
      if (!argsStr) {
        return { ok: false, error: "Mesteren svarte uten et lesbart turforslag." };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(argsStr);
      } catch {
        return { ok: false, error: "Mesterens svar var ulesbart." };
      }
      const suggestions = (parsed as { suggestions?: TripSuggestion[] })?.suggestions ?? [];
      if (!Array.isArray(suggestions) || suggestions.length === 0) {
        return { ok: false, error: "Ingen turforslag funnet for dette området." };
      }
      // Normaliser distanceKm: 0 betyr "ukjent"
      const cleaned: TripSuggestion[] = suggestions.map((s) => ({
        ...s,
        distanceKm: s.distanceKm && s.distanceKm > 0 ? s.distanceKm : null,
      }));
      return {
        ok: true,
        suggestions: cleaned,
        locationLabel: data.location,
        category: data.category,
      };
    } catch (e) {
      console.error("getTripSuggestions failed:", e);
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
