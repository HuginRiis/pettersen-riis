// AI-drevet smart-søk. Bruker Lovable AI Gateway og logger til ai_search_log.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SEARCH_INDEX } from "@/lib/search-index";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SmartSearchResult = {
  answer: string;
  hits: Array<{ title: string; path: string; reason: string }>;
};

export const aiSmartSearch = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ query: z.string().min(1).max(300) }).parse(data),
  )
  .handler(async ({ data }): Promise<SmartSearchResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return {
        answer: "AI-søk er ikke konfigurert (mangler LOVABLE_API_KEY).",
        hits: [],
      };
    }

    const indexForPrompt = SEARCH_INDEX.map(
      (e) =>
        `- ${e.title} [${e.path}] (${e.section}) — ${e.description} | nøkkelord: ${e.keywords.join(", ")}`,
    ).join("\n");

    const systemPrompt = `Du er en hjelper for House Pettersen-Riis-appen. Du får en liste over alle sider/funksjoner i appen og en brukerspørring. Returner gyldig JSON med:
{
  "answer": "kort norsk svar (1-2 setninger) om hva brukeren leter etter",
  "hits": [{"title": "...", "path": "/...", "reason": "kort forklaring på hvorfor dette treffer"}]
}
Inkluder opptil 5 treff sortert etter relevans. Bruk KUN paths fra listen. Hvis ingenting passer, returner tom hits-liste.

Sider:
${indexForPrompt}`;

    const model = "google/gemini-2.5-flash";
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let status: "ok" | "error" = "ok";
    let result: SmartSearchResult = { answer: "", hits: [] };

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
            { role: "user", content: data.query },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) {
        status = "error";
        const txt = await res.text().catch(() => "");
        result = {
          answer:
            res.status === 429
              ? "AI-tjenesten er overbelastet. Prøv igjen om litt."
              : res.status === 402
                ? "AI-budsjettet er brukt opp."
                : `AI-feil (${res.status}). ${txt.slice(0, 120)}`,
          hits: [],
        };
      } else {
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        };
        promptTokens = json.usage?.prompt_tokens ?? 0;
        completionTokens = json.usage?.completion_tokens ?? 0;
        totalTokens = json.usage?.total_tokens ?? 0;
        const raw = json.choices?.[0]?.message?.content ?? "{}";
        try {
          const parsed = JSON.parse(raw) as SmartSearchResult;
          // Filtrer hits til kun paths som finnes i indexet
          const validPaths = new Set(SEARCH_INDEX.map((e) => e.path));
          result = {
            answer: typeof parsed.answer === "string" ? parsed.answer : "",
            hits: Array.isArray(parsed.hits)
              ? parsed.hits
                  .filter((h) => h && validPaths.has(h.path))
                  .slice(0, 5)
                  .map((h) => ({
                    title: String(h.title ?? ""),
                    path: String(h.path),
                    reason: String(h.reason ?? ""),
                  }))
              : [],
          };
        } catch {
          result = { answer: raw.slice(0, 200), hits: [] };
        }
      }
    } catch (e: any) {
      status = "error";
      result = { answer: `AI-feil: ${e?.message ?? String(e)}`, hits: [] };
    }

    // Logg for budsjettsporing
    try {
      const estimatedCost =
        (promptTokens / 1_000_000) * 0.075 + (completionTokens / 1_000_000) * 0.3;
      await (supabaseAdmin.from("ai_search_log") as any).insert({
        feature: "smart-search",
        query: data.query.slice(0, 500),
        model,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        estimated_cost_usd: estimatedCost,
        status,
        authenticated: false,
      });
    } catch {
      // ignorer logg-feil
    }

    return result;
  });
