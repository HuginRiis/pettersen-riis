import { createServerFn } from "@tanstack/react-start";

export type ReceiptItem = {
  name: string;
  quantity?: number | null;
  unit_price?: number | null;
  total_price?: number | null;
};

export type ReceiptParseResult = {
  store: string | null;
  purchased_at: string | null; // ISO date YYYY-MM-DD
  total_nok: number | null;
  currency: string;
  items: ReceiptItem[];
  raw_text: string;
  is_food: boolean;
  model: string;
};

const MODEL = "google/gemini-2.5-flash";

export const parseReceiptImage = createServerFn({ method: "POST" })
  .inputValidator((input: { imageUrl: string }) => input)
  .handler(async ({ data }): Promise<ReceiptParseResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY mangler");

    const systemPrompt = `Du er en assistent som leser norske kvitteringer fra bilder (dagligvare, elektronikk, byggevare, klær, alt mulig).
Returner KUN strukturert data via verktøyet 'extract_receipt'.
- store: butikknavn (Rema 1000, Kiwi, Coop Extra, Meny, Bunnpris, Spar, Elkjøp, XXL, Jula, Biltema, Power osv.)
- purchased_at: kjøpsdato i ISO-format YYYY-MM-DD. Bruk dato + klokkeslett fra kvitteringen.
- total_nok: totalsum i kroner (tall, ikke streng)
- items: liste med varer slik de står på kvitteringen, med navn, antall og pris
- is_food: true HVIS kvitteringen i hovedsak er matvarer/dagligvarer (Rema 1000, Kiwi, Coop, Meny, Bunnpris, Spar etc.). false for elektronikk, byggevare, klær, verktøy etc.
- raw_text: full tekst slik den står på kvitteringen
Hvis du er usikker på et felt, sett det til null. Ikke finn på data.`;

    const body = {
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Les kvitteringen og hent ut butikk, dato, totalsum og varer." },
            { type: "image_url", image_url: { url: data.imageUrl } },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "extract_receipt",
            description: "Strukturert kvitteringsdata",
            parameters: {
              type: "object",
              properties: {
                store: { type: ["string", "null"] },
                purchased_at: { type: ["string", "null"], description: "ISO date YYYY-MM-DD" },
                total_nok: { type: ["number", "null"] },
                currency: { type: "string", default: "NOK" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      quantity: { type: ["number", "null"] },
                      unit_price: { type: ["number", "null"] },
                      total_price: { type: ["number", "null"] },
                    },
                    required: ["name"],
                  },
                },
                raw_text: { type: "string" },
                is_food: { type: "boolean", description: "true hvis matvare/dagligvare-kvittering" },
              },
              required: ["items", "raw_text", "is_food"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "extract_receipt" } },
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      if (res.status === 429) throw new Error("AI er midlertidig overbelastet — prøv igjen om litt.");
      if (res.status === 402) throw new Error("AI-kreditt tom — fyll på i Lovable-arbeidsområdet.");
      const t = await res.text();
      throw new Error(`AI-feil (${res.status}): ${t.slice(0, 200)}`);
    }

    const json = await res.json();
    const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("AI ga ingen strukturert kvitterings-data");
    }
    const parsed = JSON.parse(toolCall.function.arguments);

    return {
      store: parsed.store ?? null,
      purchased_at: parsed.purchased_at ?? null,
      total_nok: typeof parsed.total_nok === "number" ? parsed.total_nok : null,
      currency: parsed.currency ?? "NOK",
      items: Array.isArray(parsed.items) ? parsed.items : [],
      raw_text: parsed.raw_text ?? "",
      is_food: typeof parsed.is_food === "boolean" ? parsed.is_food : false,
      model: MODEL,
    };
  });
