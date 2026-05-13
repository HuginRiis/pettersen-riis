import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// =================================================================
// Types
// =================================================================

export type OkonomiCategory = {
  id: string;
  name: string;
  icon: string | null;
  color: string;
  monthly_budget: number | null;
  yearly_budget: number | null;
  sort_order: number;
  hidden: boolean;
  is_income: boolean;
  is_transfer: boolean;
};

export type OkonomiTransaction = {
  id: string;
  txn_date: string;
  description: string;
  merchant: string | null;
  amount: number;
  category_id: string | null;
  account: string | null;
  source: string;
  external_ref: string | null;
  note: string | null;
  approved: boolean;
};

export type ParsedTxn = {
  txn_date: string;
  description: string;
  amount: number;
  account?: string | null;
  external_ref?: string | null;
  category_id?: string | null;
  merchant?: string | null;
};

// =================================================================
// Categories
// =================================================================

export const listOkonomiCategories = createServerFn({ method: "GET" }).handler(
  async (): Promise<OkonomiCategory[]> => {
    const { data, error } = await supabaseAdmin
      .from("okonomi_categories")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      ...r,
      monthly_budget: r.monthly_budget !== null ? Number(r.monthly_budget) : null,
      yearly_budget: r.yearly_budget !== null ? Number(r.yearly_budget) : null,
    })) as OkonomiCategory[];
  },
);

export const upsertOkonomiCategory = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(80),
        icon: z.string().nullable().optional(),
        color: z.string().min(3).max(20).default("#94a3b8"),
        monthly_budget: z.number().nullable().optional(),
        yearly_budget: z.number().nullable().optional(),
        sort_order: z.number().int().default(500),
        hidden: z.boolean().default(false),
        is_income: z.boolean().default(false),
        is_transfer: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const payload = { ...data };
    const { data: row, error } = await supabaseAdmin
      .from("okonomi_categories")
      .upsert(payload as any, { onConflict: "id" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as any;
  });

export const deleteOkonomiCategory = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("okonomi_categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =================================================================
// Transactions
// =================================================================

export const listOkonomiTransactions = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().int().min(1).max(2000).default(500),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<OkonomiTransaction[]> => {
    let q = supabaseAdmin
      .from("okonomi_transactions")
      .select("*")
      .order("txn_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.from) q = q.gte("txn_date", data.from);
    if (data.to) q = q.lte("txn_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({ ...r, amount: Number(r.amount) })) as OkonomiTransaction[];
  });

export const upsertOkonomiTransaction = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        txn_date: z.string(),
        description: z.string().min(1).max(500),
        merchant: z.string().max(200).nullable().optional(),
        amount: z.number(),
        category_id: z.string().uuid().nullable().optional(),
        account: z.string().max(200).nullable().optional(),
        note: z.string().max(2000).nullable().optional(),
        approved: z.boolean().default(true),
        source: z.string().default("manual"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("okonomi_transactions")
      .upsert(data as any, { onConflict: "id" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as any;
  });

export const deleteOkonomiTransaction = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("okonomi_transactions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =================================================================
// Import
// =================================================================

async function loadRules(): Promise<{ pattern: string; category_id: string; priority: number }[]> {
  const { data } = await supabaseAdmin
    .from("okonomi_merchant_rules")
    .select("pattern,category_id,priority")
    .order("priority", { ascending: false });
  return (data ?? []) as any;
}

function applyRules(
  description: string,
  rules: { pattern: string; category_id: string; priority: number }[],
): string | null {
  const desc = description.toLowerCase();
  for (const r of rules) {
    if (desc.includes(r.pattern.toLowerCase())) return r.category_id;
  }
  return null;
}

const importSchema = z.object({
  rows: z
    .array(
      z.object({
        txn_date: z.string(),
        description: z.string().min(1),
        amount: z.number(),
        account: z.string().nullable().optional(),
        external_ref: z.string().nullable().optional(),
      }),
    )
    .min(1)
    .max(2000),
  source: z.enum(["csv", "pdf"]).default("csv"),
  default_account: z.string().optional(),
});

export const importOkonomiTransactions = createServerFn({ method: "POST" })
  .inputValidator((d) => importSchema.parse(d))
  .handler(async ({ data }) => {
    const rules = await loadRules();
    const rows = data.rows.map((r) => ({
      txn_date: r.txn_date,
      description: r.description,
      amount: r.amount,
      account: r.account ?? data.default_account ?? null,
      external_ref: r.external_ref ?? null,
      category_id: applyRules(r.description, rules),
      source: data.source,
      approved: true,
    }));

    let inserted = 0;
    let skipped = 0;
    for (const row of rows) {
      const { error } = await supabaseAdmin
        .from("okonomi_transactions")
        .upsert(row as any, { onConflict: "external_ref", ignoreDuplicates: true });
      if (error) {
        skipped++;
        console.warn("[okonomi] insert failed:", error.message);
      } else {
        inserted++;
      }
    }
    return { inserted, skipped, total: rows.length };
  });

// =================================================================
// PDF / image kontoutskrift via Lovable AI
// =================================================================

export const parseStatementWithAI = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        // base64 (uten prefix) eller data-URL
        fileBase64: z.string().min(20),
        mimeType: z.string().default("application/pdf"),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ rows: ParsedTxn[] }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY mangler");

    const cleanBase64 = data.fileBase64.includes(",")
      ? data.fileBase64.split(",")[1]
      : data.fileBase64;
    const dataUrl = `data:${data.mimeType};base64,${cleanBase64}`;

    const tool = {
      type: "function",
      function: {
        name: "extract_transactions",
        description: "Returner alle linjer fra norsk bank-kontoutskrift.",
        parameters: {
          type: "object",
          properties: {
            rows: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  txn_date: { type: "string", description: "ISO YYYY-MM-DD" },
                  description: { type: "string" },
                  amount: {
                    type: "number",
                    description: "Negativt = utgift, positivt = innskudd. NOK.",
                  },
                  account: { type: "string" },
                },
                required: ["txn_date", "description", "amount"],
              },
            },
          },
          required: ["rows"],
        },
      },
    };

    const userContent: any[] = [
      {
        type: "text",
        text:
          "Hent ut alle posteringer fra denne norske kontoutskriften. " +
          "Bruk YYYY-MM-DD for dato. Beløp i NOK med tegn (negativt = utgift). " +
          "Beskrivelse skal være den raden som vises (butikk/teller). Hopp over saldolinjer/overskrifter.",
      },
      { type: "image_url", image_url: { url: dataUrl } },
    ];

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "user", content: userContent }],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "extract_transactions" } },
      }),
    });

    if (resp.status === 429) throw new Error("AI er i kø, prøv igjen om litt.");
    if (resp.status === 402) throw new Error("AI-kreditten er brukt opp.");
    if (!resp.ok) throw new Error(`AI-feil ${resp.status}: ${await resp.text()}`);

    const json = await resp.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return { rows: [] };
    const args = JSON.parse(call.function.arguments);

    const rules = await loadRules();
    const rows: ParsedTxn[] = (args.rows ?? []).map((r: any) => ({
      txn_date: r.txn_date,
      description: r.description,
      amount: Number(r.amount),
      account: r.account ?? null,
      category_id: applyRules(r.description, rules),
    }));
    return { rows };
  });
