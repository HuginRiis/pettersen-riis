// Kosthold: dagbok over måltider + AI-analyse av matbilder og tekst.
import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import { z } from "zod";

const __loadAdmin = createIsomorphicFn()
  .server((): Promise<typeof import("@/integrations/supabase/client.server")> =>
    import("@/integrations/supabase/client.server"),
  )
  .client(
    (): Promise<typeof import("@/integrations/supabase/client.server")> =>
      Promise.resolve({ supabaseAdmin: null } as unknown as typeof import("@/integrations/supabase/client.server")),
  );
const { supabaseAdmin } = await __loadAdmin();

const __loadAuth = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/house-auth.server")> => import("@/lib/house-auth.server"))
  .client(
    (): Promise<typeof import("@/lib/house-auth.server")> =>
      Promise.resolve({
        requireHouseAuth: async () => {},
        isHouseAuthenticated: async () => false,
      } as unknown as typeof import("@/lib/house-auth.server")),
  );
const { requireHouseAuth } = await __loadAuth();

const VISION_MODEL = "google/gemini-2.5-flash";

export type MealRow = {
  id: string;
  who: string;
  eaten_at: string;
  meal_type: string;
  name: string;
  amount_text: string | null;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  lactose_free: boolean | null;
  source: string;
  image_url: string | null;
  notes: string | null;
  created_at: string;
};

export type MealAnalysis = {
  name: string;
  amount_text: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  lactose_free: boolean;
  confidence: "low" | "medium" | "high";
  notes: string;
};

const NUTRITION_TOOL = {
  type: "function",
  function: {
    name: "estimate_nutrition",
    description: "Estimert næringsinnhold for et måltid",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Kort norsk navn på måltidet" },
        amount_text: { type: "string", description: "Anslått mengde, f.eks. '1 tallerken, ca 350 g'" },
        kcal: { type: "number" },
        protein_g: { type: "number" },
        carbs_g: { type: "number" },
        fat_g: { type: "number" },
        fiber_g: { type: "number" },
        sugar_g: { type: "number" },
        lactose_free: { type: "boolean", description: "true hvis måltidet er laktosefritt" },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        notes: { type: "string", description: "Kort norsk kommentar med tips" },
      },
      required: [
        "name",
        "amount_text",
        "kcal",
        "protein_g",
        "carbs_g",
        "fat_g",
        "fiber_g",
        "sugar_g",
        "lactose_free",
        "confidence",
        "notes",
      ],
      additionalProperties: false,
    },
  },
} as const;

const SYSTEM_PROMPT =
  "Du er en norsk klinisk ernæringsfysiolog. Du anslår næringsinnhold i måltider så realistisk som mulig. " +
  "Vurder porsjonsstørrelse ut fra tallerken, bestikk og kjente referanser. Angi alltid tall (aldri null). " +
  "Marker lactose_free=false hvis måltidet trolig inneholder melk, fløte, ost (unntatt lagret ost som parmesan), is eller melkepulver. " +
  "Svar KUN via verktøyet estimate_nutrition.";

async function callAi(messages: unknown[]): Promise<MealAnalysis> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY mangler");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages,
      tools: [NUTRITION_TOOL],
      tool_choice: { type: "function", function: { name: "estimate_nutrition" } },
    }),
  });

  if (res.status === 429) throw new Error("For mange forespørsler mot AI akkurat nå — prøv igjen om litt.");
  if (res.status === 402) throw new Error("AI-kredittene er brukt opp. Fyll på i Lovable for å fortsette.");
  if (!res.ok) throw new Error(`AI feilet (${res.status})`);

  const json = (await res.json()) as any;
  const call = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!call) throw new Error("AI ga ikke noe svar å tolke.");
  return JSON.parse(call) as MealAnalysis;
}

export const analyzeMealImage = createServerFn({ method: "POST" })
  .inputValidator((input: { imageDataUrl: string; hint?: string }) =>
    z.object({ imageDataUrl: z.string().min(20), hint: z.string().optional() }).parse(input),
  )
  .handler(async ({ data }): Promise<MealAnalysis> => {
    await requireHouseAuth();
    return callAi([
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Analyser matbildet og anslå kalorier og næringsstoffer for hele porsjonen." +
              (data.hint ? ` Tilleggsinfo fra brukeren: ${data.hint}` : ""),
          },
          { type: "image_url", image_url: { url: data.imageDataUrl } },
        ],
      },
    ]);
  });

export const analyzeMealText = createServerFn({ method: "POST" })
  .inputValidator((input: { text: string }) => z.object({ text: z.string().min(2) }).parse(input))
  .handler(async ({ data }): Promise<MealAnalysis> => {
    await requireHouseAuth();
    return callAi([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Anslå næringsinnhold for dette måltidet: ${data.text}` },
    ]);
  });

export const listMeals = createServerFn({ method: "GET" })
  .inputValidator((input: { days?: number } | undefined) => ({ days: input?.days ?? 14 }))
  .handler(async ({ data }): Promise<MealRow[]> => {
    await requireHouseAuth();
    const from = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from("kosthold_meals")
      .select("*")
      .gte("eaten_at", from)
      .order("eaten_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as MealRow[];
  });

const MealInput = z.object({
  who: z.string().default("Alle"),
  eaten_at: z.string().optional(),
  meal_type: z.string().default("annet"),
  name: z.string().min(1),
  amount_text: z.string().nullable().optional(),
  kcal: z.number().nullable().optional(),
  protein_g: z.number().nullable().optional(),
  carbs_g: z.number().nullable().optional(),
  fat_g: z.number().nullable().optional(),
  fiber_g: z.number().nullable().optional(),
  sugar_g: z.number().nullable().optional(),
  lactose_free: z.boolean().nullable().optional(),
  source: z.string().default("manual"),
  notes: z.string().nullable().optional(),
});

export const addMeal = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => MealInput.parse(input))
  .handler(async ({ data }): Promise<MealRow> => {
    await requireHouseAuth();
    const { data: row, error } = await supabaseAdmin
      .from("kosthold_meals")
      .insert({ ...data, eaten_at: data.eaten_at ?? new Date().toISOString() })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as MealRow;
  });

export const deleteMeal = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await requireHouseAuth();
    const { error } = await supabaseAdmin.from("kosthold_meals").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
