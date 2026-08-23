// Kosthold: dagbok over måltider + AI-analyse av matbilder og tekst.
import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import { z } from "zod";

const __loadAdmin = createIsomorphicFn()
  .server(
    (): Promise<typeof import("@/integrations/supabase/client.server")> =>
      import("@/integrations/supabase/client.server"),
  )
  .client(
    (): Promise<typeof import("@/integrations/supabase/client.server")> =>
      Promise.resolve({
        supabaseAdmin: null,
      } as unknown as typeof import("@/integrations/supabase/client.server")),
  );
const { supabaseAdmin } = await __loadAdmin();

const __loadAuth = createIsomorphicFn()
  .server(
    (): Promise<typeof import("@/lib/house-auth.server")> => import("@/lib/house-auth.server"),
  )
  .client(
    (): Promise<typeof import("@/lib/house-auth.server")> =>
      Promise.resolve({
        requireHouseAuth: async () => {},
        isHouseAuthenticated: async () => false,
      } as unknown as typeof import("@/lib/house-auth.server")),
  );
const { requireHouseAuth } = await __loadAuth();

const __loadAiUsage = createIsomorphicFn()
  .server(
    (): Promise<typeof import("@/lib/ai-usage.server")> => import("@/lib/ai-usage.server"),
  )
  .client(
    (): Promise<typeof import("@/lib/ai-usage.server")> =>
      Promise.resolve({
        logAiSearch: async () => {},
      } as unknown as typeof import("@/lib/ai-usage.server")),
  );
const { logAiSearch } = await __loadAiUsage();

const VISION_MODEL = "google/gemini-2.5-flash";

/** Fast estimert kostnad per AI-kall på kosthold (bilde- eller tekst-skann). */
const KOSTHOLD_COST_USD = 0.05;


export type MealItem = { name: string; amount_g?: number | null; calories?: number | null };

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
  health_score: number | null;
  ai_notes: string | null;
  items: MealItem[] | null;
  source: string;
  image_url: string | null;
  /** Tidsbegrenset visnings-URL generert på serveren (privat bucket) */
  image_view_url?: string | null;
  notes: string | null;
  created_at: string;
};


export type GoalRow = {
  id: string;
  person: string;
  plan_type: string;
  calorie_goal: number;
  protein_goal: number;
  carbs_goal: number;
  fat_goal: number;
  fiber_goal: number;
  weight_kg: number | null;
  height_cm: number | null;
  age: number | null;
  sex: string | null;
};

export type MealAnalysis = {
  name: string;
  meal_type: string;
  amount_text: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  lactose_free: boolean;
  health_score: number;
  items: MealItem[];
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
        meal_type: {
          type: "string",
          enum: ["Frokost", "Lunsj", "Snack", "Middag", "Kveld", "Drikke"],
          description: "Hvilken måltidstype dette mest sannsynlig er",
        },
        amount_text: {
          type: "string",
          description: "Anslått mengde, f.eks. '1 tallerken, ca 350 g'",
        },
        kcal: { type: "number" },
        protein_g: { type: "number" },
        carbs_g: { type: "number" },
        fat_g: { type: "number" },
        fiber_g: { type: "number" },
        sugar_g: { type: "number" },
        lactose_free: { type: "boolean", description: "true hvis måltidet er laktosefritt" },
        health_score: { type: "number", description: "0-100 hvor sunt måltidet er totalt sett" },
        items: {
          type: "array",
          description: "Enkeltingrediensene AI ser i måltidet",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              amount_g: { type: "number" },
              calories: { type: "number" },
            },
            required: ["name", "amount_g", "calories"],
            additionalProperties: false,
          },
        },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        notes: { type: "string", description: "Kort norsk kommentar med tips" },
      },
      required: [
        "name",
        "meal_type",
        "amount_text",
        "kcal",
        "protein_g",
        "carbs_g",
        "fat_g",
        "fiber_g",
        "sugar_g",
        "lactose_free",
        "health_score",
        "items",
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
  "Del måltidet opp i enkeltingredienser med gram og kalorier. " +
  "Marker lactose_free=false hvis måltidet trolig inneholder melk, fløte, ost (unntatt lagret ost som parmesan), is eller melkepulver. " +
  "Svar KUN via verktøyet estimate_nutrition.";

async function logKosthold(
  feature: string,
  query: string | null,
  status: "ok" | "rate_limited" | "error",
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number },
) {
  try {
    await logAiSearch({
      feature,
      query,
      model: VISION_MODEL,
      authenticated: true,
      status,
      promptTokens: usage?.prompt_tokens ?? null,
      completionTokens: usage?.completion_tokens ?? null,
      totalTokens: usage?.total_tokens ?? null,
      costUsd: status === "ok" ? KOSTHOLD_COST_USD : 0,
    });
  } catch {
    /* logging skal aldri velte kallet */
  }
}

async function callAi(messages: unknown[], feature: string, query: string | null): Promise<MealAnalysis> {
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

  if (!res.ok) {
    await logKosthold(feature, query, res.status === 429 ? "rate_limited" : "error");
  }
  if (res.status === 429)
    throw new Error("For mange forespørsler mot AI akkurat nå — prøv igjen om litt.");
  if (res.status === 402)
    throw new Error("AI-kredittene er brukt opp. Fyll på i Lovable for å fortsette.");
  if (!res.ok) throw new Error(`AI feilet (${res.status})`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  await logKosthold(feature, query, "ok", json?.usage);
  const call = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!call) throw new Error("AI ga ikke noe svar å tolke.");
  const parsed = JSON.parse(call) as MealAnalysis;
  return { ...parsed, items: Array.isArray(parsed.items) ? parsed.items : [] };
}


export const analyzeMealImage = createServerFn({ method: "POST" })
  .inputValidator((input: { imageDataUrl: string; hint?: string }) =>
    z.object({ imageDataUrl: z.string().min(20), hint: z.string().optional() }).parse(input),
  )
  .handler(async ({ data }): Promise<MealAnalysis> => {
    await requireHouseAuth();
    return callAi(
      [
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
      ],
      "kosthold-bilde",
      data.hint ?? "matbilde",
    );

  });

const IDENTIFY_TOOL = {
  type: "function",
  function: {
    name: "identify_meal",
    description: "Identifiser maten på bildet og hva som mangler av mengdeinfo",
    parameters: {
      type: "object",
      properties: {
        guess: { type: "string", description: "Kort norsk navn på maten du ser" },
        question: {
          type: "string",
          description:
            "Ett kort norsk spørsmål om mengde/størrelse eller annen relevant info du trenger",
        },
        suggestions: {
          type: "array",
          description: "3-5 realistiske svaralternativer, f.eks. 'Hamburger 150 g'",
          items: { type: "string" },
        },
      },
      required: ["guess", "question", "suggestions"],
      additionalProperties: false,
    },
  },
} as const;

export type MealIdentification = { guess: string; question: string; suggestions: string[] };

export const identifyMealImage = createServerFn({ method: "POST" })
  .inputValidator((input: { imageDataUrl: string }) =>
    z.object({ imageDataUrl: z.string().min(20) }).parse(input),
  )
  .handler(async ({ data }): Promise<MealIdentification> => {
    await requireHouseAuth();
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY mangler");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Du er en norsk ernæringsfysiolog. Se på matbildet, si hva du tror det er, " +
              "og still ETT kort spørsmål om mengde/vekt/størrelse (eller annen info du mangler) " +
              "for å kunne regne ut kalorier presist. Gi realistiske forslag. Svar KUN via verktøyet.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Hva er dette, og hva trenger du å vite om mengden?" },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
        tools: [IDENTIFY_TOOL],
        tool_choice: { type: "function", function: { name: "identify_meal" } },
      }),
    });
    if (res.status === 429)
      throw new Error("For mange forespørsler mot AI akkurat nå — prøv igjen om litt.");
    if (res.status === 402)
      throw new Error("AI-kredittene er brukt opp. Fyll på i Lovable for å fortsette.");
    if (!res.ok) throw new Error(`AI feilet (${res.status})`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any;
    const call = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!call) throw new Error("AI ga ikke noe svar å tolke.");
    const parsed = JSON.parse(call) as MealIdentification;
    return {
      guess: parsed.guess ?? "",
      question: parsed.question || "Hvor stor porsjon er dette?",
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 5) : [],
    };
  });

export const analyzeMealText = createServerFn({ method: "POST" })
  .inputValidator((input: { text: string }) => z.object({ text: z.string().min(2) }).parse(input))
  .handler(async ({ data }): Promise<MealAnalysis> => {
    await requireHouseAuth();
    return callAi(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Anslå næringsinnhold for dette måltidet: ${data.text}` },
      ],
      "kosthold-tekst",
      data.text.slice(0, 200),
    );

  });

export const listMeals = createServerFn({ method: "GET" })
  .inputValidator((input: { days?: number } | undefined) => ({ days: input?.days ?? 35 }))
  .handler(async ({ data }): Promise<MealRow[]> => {
    await requireHouseAuth();
    const from = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from("kosthold_meals")
      .select("*")
      .gte("eaten_at", from)
      .order("eaten_at", { ascending: false });
    if (error) throw new Error(error.message);
    const meals = (rows ?? []) as unknown as MealRow[];
    const paths = meals
      .map((m) => m.image_url)
      .filter((p): p is string => !!p && !p.startsWith("http"));
    if (paths.length) {
      const { data: signed } = await supabaseAdmin.storage
        .from("kosthold")
        .createSignedUrls(paths, 60 * 60 * 12);
      const map = new Map<string, string>();
      (signed ?? []).forEach((s) => {
        if (s.path && s.signedUrl) map.set(s.path, s.signedUrl);
      });
      meals.forEach((m) => {
        if (m.image_url) m.image_view_url = map.get(m.image_url) ?? null;
      });
    }
    meals.forEach((m) => {
      if (m.image_url?.startsWith("http")) m.image_view_url = m.image_url;
    });
    return meals;
  });

export const uploadMealImage = createServerFn({ method: "POST" })
  .inputValidator((input: { dataUrl: string }) =>
    z.object({ dataUrl: z.string().min(20) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ path: string; url: string }> => {
    await requireHouseAuth();
    const match = /^data:([^;]+);base64,(.+)$/.exec(data.dataUrl);
    if (!match) throw new Error("Ugyldig bildeformat");
    const mime = match[1];
    const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
    const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "webp";
    const path = `meals/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from("kosthold")
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (error) throw new Error(error.message);
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("kosthold")
      .createSignedUrl(path, 60 * 60 * 12);
    if (sErr) throw new Error(sErr.message);
    return { path, url: signed.signedUrl };
  });


const MealInput = z.object({
  who: z.string().default("Alle"),
  eaten_at: z.string().optional(),
  meal_type: z.string().default("Middag"),
  name: z.string().min(1),
  amount_text: z.string().nullable().optional(),
  kcal: z.number().nullable().optional(),
  protein_g: z.number().nullable().optional(),
  carbs_g: z.number().nullable().optional(),
  fat_g: z.number().nullable().optional(),
  fiber_g: z.number().nullable().optional(),
  sugar_g: z.number().nullable().optional(),
  lactose_free: z.boolean().nullable().optional(),
  health_score: z.number().nullable().optional(),
  ai_notes: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        name: z.string(),
        amount_g: z.number().nullable().optional(),
        calories: z.number().nullable().optional(),
      }),
    )
    .optional(),
  image_url: z.string().nullable().optional(),
  source: z.string().default("manual"),
  notes: z.string().nullable().optional(),
});

export const addMeal = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => MealInput.parse(input))
  .handler(async ({ data }): Promise<MealRow> => {
    await requireHouseAuth();
    const { data: row, error } = await supabaseAdmin
      .from("kosthold_meals")
      .insert({
        ...data,
        items: (data.items ?? []) as never,
        eaten_at: data.eaten_at ?? new Date().toISOString(),
        added_by: data.who,
      } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as MealRow;
  });

export const updateMeal = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => MealInput.extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<MealRow> => {
    await requireHouseAuth();
    const { id, ...rest } = data;
    const { data: row, error } = await supabaseAdmin
      .from("kosthold_meals")
      .update({ ...rest, items: (rest.items ?? []) as never } as never)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as MealRow;
  });

export const deleteMeal = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await requireHouseAuth();
    const { error } = await supabaseAdmin.from("kosthold_meals").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listGoals = createServerFn({ method: "GET" }).handler(async (): Promise<GoalRow[]> => {
  await requireHouseAuth();
  const { data, error } = await supabaseAdmin.from("kosthold_goals").select("*");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as GoalRow[];
});

export const saveGoal = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        person: z.string().min(1),
        plan_type: z.string().default("Vedlikehold"),
        calorie_goal: z.number().int().min(800).max(8000),
        protein_goal: z.number().int().min(0).max(500),
        carbs_goal: z.number().int().min(0).max(1000),
        fat_goal: z.number().int().min(0).max(400),
        fiber_goal: z.number().int().min(0).max(150),
        weight_kg: z.number().min(20).max(300).nullable().optional(),
        height_cm: z.number().min(100).max(250).nullable().optional(),
        age: z.number().int().min(2).max(120).nullable().optional(),
        sex: z.enum(["mann", "kvinne"]).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<GoalRow> => {
    await requireHouseAuth();
    const { data: row, error } = await supabaseAdmin
      .from("kosthold_goals")
      .upsert(data as never, { onConflict: "person" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as GoalRow;
  });
