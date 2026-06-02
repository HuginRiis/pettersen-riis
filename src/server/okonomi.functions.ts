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

function accountMatchesAny(account: string | null | undefined, patterns: string[]): boolean {
  if (!account || patterns.length === 0) return false;
  const a = account.toString().toLowerCase().replace(/[\s.\-]/g, "");
  for (const p of patterns) {
    const pp = p.toString().toLowerCase().replace(/[\s.\-]/g, "");
    if (!pp) continue;
    if (a.includes(pp) || pp.includes(a)) return true;
  }
  return false;
}

function filterInternalTransfers<T extends OkonomiTransaction>(
  rows: T[],
  patterns: string[],
): T[] {
  if (patterns.length === 0) return rows;
  const internal = rows
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => accountMatchesAny(r.account, patterns));
  if (internal.length < 2) return rows;
  const drop = new Set<number>();
  // Group by abs(amount)
  const byAmt = new Map<string, Array<{ r: T; idx: number }>>();
  for (const it of internal) {
    const k = amountKey(Math.abs(Number(it.r.amount)));
    const arr = byAmt.get(k) ?? [];
    arr.push(it);
    byAmt.set(k, arr);
  }
  for (const arr of byAmt.values()) {
    const pos = arr.filter((x) => Number(x.r.amount) > 0).sort((a, b) => a.r.txn_date.localeCompare(b.r.txn_date));
    const neg = arr.filter((x) => Number(x.r.amount) < 0).sort((a, b) => a.r.txn_date.localeCompare(b.r.txn_date));
    for (const p of pos) {
      if (drop.has(p.idx)) continue;
      const match = neg.find((n) => {
        if (drop.has(n.idx)) return false;
        const dp = Date.parse(p.r.txn_date);
        const dn = Date.parse(n.r.txn_date);
        if (isNaN(dp) || isNaN(dn)) return false;
        return Math.abs(dp - dn) <= 1000 * 60 * 60 * 24 * 3;
      });
      if (match) {
        drop.add(p.idx);
        drop.add(match.idx);
      }
    }
  }
  return rows.filter((_, idx) => !drop.has(idx));
}

export const listOkonomiTransactions = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().int().min(1).max(2000).default(500),
        exclude_internal_transfers: z.boolean().optional(),
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
    const mapped = (rows ?? []).map((r: any) => ({ ...r, amount: Number(r.amount) })) as OkonomiTransaction[];
    if (data.exclude_internal_transfers) {
      const { data: s } = await supabaseAdmin
        .from("okonomi_budget_settings")
        .select("internal_transfer_filter_enabled, internal_transfer_accounts")
        .eq("id", 1)
        .maybeSingle();
      const enabled = Boolean((s as any)?.internal_transfer_filter_enabled);
      const patterns = Array.isArray((s as any)?.internal_transfer_accounts)
        ? ((s as any).internal_transfer_accounts as string[])
        : [];
      if (enabled && patterns.length > 0) {
        return filterInternalTransfers(mapped, patterns);
      }
    }
    return mapped;
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

export const bulkUpdateOkonomiCategory = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(5000),
        category_id: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("okonomi_transactions")
      .update({ category_id: data.category_id })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
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
        category_id: z.string().uuid().nullable().optional(),
      }),
    )
    .min(1)
    .max(2000),
  source: z.enum(["csv", "pdf", "manual"]).default("csv"),
  default_account: z.string().optional(),
});

const dupCheckSchema = z.object({
  rows: z
    .array(
      z.object({
        txn_date: z.string(),
        description: z.string().min(1),
        amount: z.number(),
        account: z.string().nullable().optional(),
      }),
    )
    .min(1)
    .max(2000),
  default_account: z.string().optional(),
});

function normDesc(s: string | null | undefined): string {
  return (s ?? "").toString().toLowerCase().replace(/\s+/g, " ").trim();
}
function normAccount(s: string | null | undefined): string {
  return (s ?? "").toString().replace(/[\s.\-]/g, "").trim();
}
function amountKey(a: number): string {
  // matche på 2 desimaler for å unngå float-støy
  return (Math.round(Number(a) * 100) / 100).toFixed(2);
}

export const findOkonomiDuplicates = createServerFn({ method: "POST" })
  .inputValidator((d) => dupCheckSchema.parse(d))
  .handler(async ({ data }) => {
    const dupes: Array<{ index: number; existing_id: string }> = [];
    // Hent alle kandidater (samme dato + beløp) i én sveip for å unngå
    // skjøre per-rad eq-spørringer mot description (whitespace/case-følsomt)
    const dates = Array.from(new Set(data.rows.map((r) => r.txn_date)));
    const amounts = Array.from(new Set(data.rows.map((r) => amountKey(r.amount))));
    const { data: candidates } = await supabaseAdmin
      .from("okonomi_transactions")
      .select("id,txn_date,description,amount,account")
      .in("txn_date", dates)
      .in("amount", amounts as any);
    // Match kun på dato + beskrivelse + beløp (case-insensitiv, whitespace-tolerant).
    const buckets = new Map<string, Array<{ id: string; desc: string }>>();
    for (const c of (candidates ?? []) as any[]) {
      const key = `${c.txn_date}|${amountKey(Number(c.amount))}`;
      const arr = buckets.get(key) ?? [];
      arr.push({ id: c.id, desc: normDesc(c.description) });
      buckets.set(key, arr);
    }
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i]!;
      const desc = normDesc(r.description);
      const key = `${r.txn_date}|${amountKey(r.amount)}`;
      const arr = buckets.get(key) ?? [];
      const match = arr.find((c) => c.desc === desc);
      if (match) dupes.push({ index: i, existing_id: match.id });
    }
    return { duplicates: dupes };
  });

// Finn duplikatgrupper blant *eksisterende* posteringer i databasen.
// To rader regnes som duplikat hvis dato + normalisert beskrivelse + beløp + konto matcher.
export const findExistingOkonomiDuplicates = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data, error } = await supabaseAdmin
      .from("okonomi_transactions")
      .select("id,txn_date,description,amount,account,created_at")
      .order("created_at", { ascending: true })
      .limit(10000);
    if (error) throw new Error(error.message);
    const groups = new Map<
      string,
      Array<{ id: string; txn_date: string; description: string; amount: number; account: string | null; created_at: string }>
    >();
    for (const r of (data ?? []) as any[]) {
      const key = `${r.txn_date}|${amountKey(Number(r.amount))}|${normDesc(r.description)}`;
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }
    const result: Array<{
      key: string;
      keep_id: string;
      duplicates: Array<{ id: string; txn_date: string; description: string; amount: number; account: string | null }>;
    }> = [];
    for (const [key, arr] of groups.entries()) {
      if (arr.length < 2) continue;
      const [keep, ...rest] = arr;
      result.push({ key, keep_id: keep!.id, duplicates: rest });
    }
    return { groups: result };
  },
);

export const bulkDeleteOkonomiTransactions = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ ids: z.array(z.string().uuid()).min(1).max(2000) }).parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("okonomi_transactions")
      .delete()
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { deleted: data.ids.length };
  });

// Slett posteringer i et datointervall, valgfritt filtrert på konto.
export const deleteOkonomiByDateRange = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        account: z.string().nullable().optional(),
        dry_run: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    let q = supabaseAdmin
      .from("okonomi_transactions")
      .select("id,account", { count: "exact" })
      .gte("txn_date", data.from_date)
      .lte("txn_date", data.to_date);
    if (data.account && data.account.trim()) q = q.eq("account", data.account);
    const { data: rows, error, count } = await q.limit(5000);
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r: any) => r.id as string);
    if (data.dry_run) return { matched: count ?? ids.length, deleted: 0 };
    if (ids.length === 0) return { matched: 0, deleted: 0 };
    const { error: delErr } = await supabaseAdmin
      .from("okonomi_transactions")
      .delete()
      .in("id", ids);
    if (delErr) throw new Error(delErr.message);
    return { matched: count ?? ids.length, deleted: ids.length };
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
      category_id: r.category_id ?? applyRules(r.description, rules),
      source: data.source,
      approved: true,
    }));

    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const row of rows) {
      // Sjekk duplikat manuelt (partial unique index på external_ref støttes ikke av PostgREST upsert)
      if (row.external_ref) {
        const { data: existing } = await supabaseAdmin
          .from("okonomi_transactions")
          .select("id")
          .eq("external_ref", row.external_ref)
          .maybeSingle();
        if (existing) {
          skipped++;
          continue;
        }
      }
      const { error } = await supabaseAdmin.from("okonomi_transactions").insert(row as any);
      if (error) {
        skipped++;
        errors.push(error.message);
        console.warn("[okonomi] insert failed:", error.message, row);
      } else {
        inserted++;
      }
    }
    return { inserted, skipped, total: rows.length, errors: errors.slice(0, 5) };
  });

// =================================================================
// Merchant rules — lær fra brukerens valg
// =================================================================

function extractPattern(description: string): string | null {
  if (!description) return null;
  // Fjern dato-aktige fragmenter og rene tall, ta første meningsfulle ord
  const cleaned = description
    .replace(/\b\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?\b/g, " ")
    .replace(/\b\d{2,}\b/g, " ")
    .replace(/[*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  const tokens = cleaned.split(" ").filter((t) => t.length >= 3);
  if (tokens.length === 0) return cleaned.slice(0, 24).toLowerCase();
  // Bruk de første 1–2 tokens (typisk butikknavn) som mønster
  const pat = tokens.slice(0, Math.min(2, tokens.length)).join(" ").toLowerCase();
  return pat.slice(0, 60);
}

export const learnMerchantRule = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        description: z.string().min(1).max(500),
        category_id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const pattern = extractPattern(data.description);
    if (!pattern) return { ok: false, reason: "no-pattern" };
    // Finnes regelen allerede? Oppdater kategori — siste valg vinner
    const { data: existing } = await supabaseAdmin
      .from("okonomi_merchant_rules")
      .select("id")
      .eq("pattern", pattern)
      .maybeSingle();
    if (existing) {
      const { error } = await supabaseAdmin
        .from("okonomi_merchant_rules")
        .update({
          category_id: data.category_id,
          priority: 100,
          updated_at: new Date().toISOString(),
        })
        .eq("id", (existing as any).id);
      if (error) throw new Error(error.message);
      return { ok: true, pattern, updated: true };
    }
    const { error } = await supabaseAdmin
      .from("okonomi_merchant_rules")
      .insert({ pattern, category_id: data.category_id, priority: 100 } as any);
    if (error) throw new Error(error.message);
    return { ok: true, pattern, updated: false };
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

// =================================================================
// AI-kategorisering av importerte rader
// =================================================================

export const categorizeTransactionsWithAI = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        rows: z
          .array(
            z.object({
              description: z.string().min(1),
              amount: z.number(),
            }),
          )
          .min(1)
          .max(500),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ category_ids: (string | null)[] }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY mangler");

    const { data: catRows } = await supabaseAdmin
      .from("okonomi_categories")
      .select("id,name,is_income,is_transfer")
      .eq("hidden", false);
    const cats = (catRows ?? []) as any[];
    if (cats.length === 0) return { category_ids: data.rows.map(() => null) };

    const catList = cats
      .map(
        (c, i) =>
          `${i + 1}. ${c.name}${c.is_income ? " (inntekt)" : ""}${c.is_transfer ? " (overføring)" : ""}`,
      )
      .join("\n");

    const txnList = data.rows
      .map((r, i) => `${i + 1}. ${r.description} | ${r.amount} kr`)
      .join("\n");

    const tool = {
      type: "function",
      function: {
        name: "assign_categories",
        description: "Tilordne kategori-nummer til hver postering.",
        parameters: {
          type: "object",
          properties: {
            assignments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  txn_index: { type: "number" },
                  category_index: {
                    type: "number",
                    description: "1-basert kategori-nummer, eller 0 hvis ukjent.",
                  },
                },
                required: ["txn_index", "category_index"],
              },
            },
          },
          required: ["assignments"],
        },
      },
    };

    const prompt = `Du er en norsk husholdnings-bokfører. Tilordne riktig kategori til hver postering.
Negativt beløp = utgift, positivt = inntekt.

KATEGORIER:
${catList}

POSTERINGER:
${txnList}

Returner én tilordning per postering. Bruk 0 hvis ingen kategori passer.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "assign_categories" } },
      }),
    });

    if (resp.status === 429) throw new Error("AI er i kø, prøv igjen om litt.");
    if (resp.status === 402) throw new Error("AI-kreditten er brukt opp.");
    if (!resp.ok) throw new Error(`AI-feil ${resp.status}: ${await resp.text()}`);

    const json = await resp.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    const result: (string | null)[] = data.rows.map(() => null);
    if (!call) return { category_ids: result };
    const args = JSON.parse(call.function.arguments);
    for (const a of args.assignments ?? []) {
      const ti = Number(a.txn_index) - 1;
      const ci = Number(a.category_index) - 1;
      if (ti >= 0 && ti < result.length && ci >= 0 && ci < cats.length) {
        result[ti] = cats[ci].id;
      }
    }
    return { category_ids: result };
  });

// =================================================================
// Settings (payday, household composition, benchmarks)
// =================================================================

export type OkonomiSettings = {
  payday_day: number;
  household_adults: number;
  household_children_under18: number;
  household_children_over18: number;
  savings_target_pct: number;
  primary_account: string | null;
  benchmarks: Record<string, number>; // category_id -> monthly NOK
  benchmarks_generated_at: string | null;
  internal_transfer_filter_enabled: boolean;
  internal_transfer_accounts: string[];
};

const DEFAULT_SETTINGS: OkonomiSettings = {
  payday_day: 15,
  household_adults: 2,
  household_children_under18: 3,
  household_children_over18: 0,
  savings_target_pct: 20,
  primary_account: null,
  benchmarks: {},
  benchmarks_generated_at: null,
  internal_transfer_filter_enabled: false,
  internal_transfer_accounts: [],
};

export const getOkonomiSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<OkonomiSettings> => {
    const { data } = await supabaseAdmin
      .from("okonomi_budget_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (!data) return DEFAULT_SETTINGS;
    return {
      payday_day: Number((data as any).payday_day ?? 15),
      household_adults: Number((data as any).household_adults ?? 2),
      household_children_under18: Number((data as any).household_children_under18 ?? 3),
      household_children_over18: Number((data as any).household_children_over18 ?? 0),
      savings_target_pct: Number((data as any).savings_target_pct ?? 20),
      primary_account: (data as any).primary_account ?? null,
      benchmarks: ((data as any).benchmarks ?? {}) as Record<string, number>,
      benchmarks_generated_at: (data as any).benchmarks_generated_at ?? null,
      internal_transfer_filter_enabled: Boolean(
        (data as any).internal_transfer_filter_enabled ?? false,
      ),
      internal_transfer_accounts: Array.isArray((data as any).internal_transfer_accounts)
        ? ((data as any).internal_transfer_accounts as string[])
        : [],
    };
  },
);

export const updateOkonomiSettings = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        payday_day: z.number().int().min(1).max(31).optional(),
        household_adults: z.number().int().min(0).max(10).optional(),
        household_children_under18: z.number().int().min(0).max(15).optional(),
        household_children_over18: z.number().int().min(0).max(15).optional(),
        savings_target_pct: z.number().min(0).max(100).optional(),
        primary_account: z.string().max(200).nullable().optional(),
        internal_transfer_filter_enabled: z.boolean().optional(),
        internal_transfer_accounts: z.array(z.string().min(1).max(200)).max(50).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const patch: any = { ...data, updated_at: new Date().toISOString() };
    const { data: existing } = await supabaseAdmin
      .from("okonomi_budget_settings")
      .select("id")
      .eq("id", 1)
      .maybeSingle();
    if (existing) {
      const { error } = await supabaseAdmin
        .from("okonomi_budget_settings")
        .update(patch)
        .eq("id", 1);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("okonomi_budget_settings")
        .insert({ id: 1, ...patch });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const generateOkonomiBenchmarks = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ benchmarks: Record<string, number>; updated: number }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY mangler");

    const { data: settingsRow } = await supabaseAdmin
      .from("okonomi_budget_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    const s = {
      household_adults: Number((settingsRow as any)?.household_adults ?? 2),
      household_children_under18: Number((settingsRow as any)?.household_children_under18 ?? 3),
      household_children_over18: Number((settingsRow as any)?.household_children_over18 ?? 0),
    };

    const { data: catRows } = await supabaseAdmin
      .from("okonomi_categories")
      .select("id,name,is_income,is_transfer,hidden")
      .eq("hidden", false);
    const cats = (catRows ?? []).filter((c: any) => !c.is_income && !c.is_transfer) as any[];
    if (cats.length === 0) return { benchmarks: {}, updated: 0 };

    const catList = cats.map((c, i) => `${i + 1}. ${c.name}`).join("\n");

    const tool = {
      type: "function",
      function: {
        name: "set_benchmarks",
        description: "Sett gjennomsnittlig månedlig forbruk i NOK per kategori for en typisk norsk familie.",
        parameters: {
          type: "object",
          properties: {
            benchmarks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category_index: { type: "number", description: "1-basert nummer" },
                  monthly_nok: { type: "number", description: "Snitt månedlig forbruk i NOK" },
                },
                required: ["category_index", "monthly_nok"],
              },
            },
          },
          required: ["benchmarks"],
        },
      },
    };

    const prompt = `Du er en norsk forbruksøkonom. Estimer realistisk gjennomsnittlig MÅNEDLIG forbruk i NOK for en norsk husholdning bestående av:
- ${s.household_adults} voksne
- ${s.household_children_under18} barn under 18 år
- ${s.household_children_over18} barn over 18 år

Bruk SIFOs referansebudsjett og SSB forbruksundersøkelser som utgangspunkt. Inkluder også kommunale utgifter (eiendomsskatt, vann/avløp, renovasjon, feiing) der det passer i kategorien — fordel årlig kommunal avgift på 12 måneder. Inkluder også billån (typisk månedlig avdrag + renter for en norsk familie med bil) der kategorien Billån finnes. Gi ett tall per kategori under. Hvis kategorien ikke gir mening for snittfamilien, sett 0.

KATEGORIER:
${catList}

Returner alle ${cats.length} kategoriene.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "set_benchmarks" } },
      }),
    });
    if (resp.status === 429) throw new Error("AI er i kø, prøv igjen om litt.");
    if (resp.status === 402) throw new Error("AI-kreditten er brukt opp.");
    if (!resp.ok) throw new Error(`AI-feil ${resp.status}: ${await resp.text()}`);

    const json = await resp.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("AI returnerte ingen data");
    const args = JSON.parse(call.function.arguments);
    const benchmarks: Record<string, number> = {};
    for (const b of args.benchmarks ?? []) {
      const ci = Number(b.category_index) - 1;
      const v = Number(b.monthly_nok);
      if (ci >= 0 && ci < cats.length && isFinite(v) && v >= 0) {
        benchmarks[cats[ci].id] = Math.round(v);
      }
    }

    await supabaseAdmin
      .from("okonomi_budget_settings")
      .update({
        benchmarks: benchmarks as any,
        benchmarks_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    return { benchmarks, updated: Object.keys(benchmarks).length };
  },
);

// =================================================================
// Accounts (Lønnskonto, Lånekonto, Hyttkonto)
// =================================================================

export type OkonomiAccount = {
  id: string;
  slug: string;
  name: string;
  start_balance: number;
  start_date: string;
  monthly_change: number;
  yearly_change: number;
  account_patterns: string[];
  color: string;
  sort_order: number;
};

export const listOkonomiAccounts = createServerFn({ method: "GET" }).handler(
  async (): Promise<OkonomiAccount[]> => {
    const { data, error } = await supabaseAdmin
      .from("okonomi_accounts")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      ...r,
      start_balance: Number(r.start_balance),
      monthly_change: Number(r.monthly_change),
      yearly_change: Number(r.yearly_change),
      account_patterns: r.account_patterns ?? [],
    })) as OkonomiAccount[];
  },
);

export const upsertOkonomiAccount = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        slug: z.string().min(1).max(40),
        name: z.string().min(1).max(80),
        start_balance: z.number().default(0),
        start_date: z.string().default(() => new Date().toISOString().slice(0, 10)),
        monthly_change: z.number().default(0),
        yearly_change: z.number().default(0),
        account_patterns: z.array(z.string().max(120)).max(50).default([]),
        color: z.string().max(20).default("#f59e0b"),
        sort_order: z.number().int().default(100),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("okonomi_accounts")
      .upsert(data as any, { onConflict: "id" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as any;
  });

export const deleteOkonomiAccount = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("okonomi_accounts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =================================================================
// Bulk update transactions (multi-field)
// =================================================================

export const bulkUpsertOkonomiTransactions = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        rows: z
          .array(
            z.object({
              id: z.string().uuid(),
              txn_date: z.string().optional(),
              description: z.string().min(1).max(500).optional(),
              amount: z.number().optional(),
              category_id: z.string().uuid().nullable().optional(),
              account: z.string().max(200).nullable().optional(),
              note: z.string().max(2000).nullable().optional(),
            }),
          )
          .min(1)
          .max(500),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    let count = 0;
    for (const r of data.rows) {
      const { id, ...patch } = r;
      const cleanPatch: any = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v !== undefined) cleanPatch[k] = v;
      }
      if (Object.keys(cleanPatch).length === 0) continue;
      cleanPatch.updated_at = new Date().toISOString();
      const { error } = await supabaseAdmin
        .from("okonomi_transactions")
        .update(cleanPatch)
        .eq("id", id);
      if (error) throw new Error(error.message);
      count++;
    }
    return { ok: true, count };
  });

// =================================================================
// Last import summary (for hero card)
// =================================================================

export type LastImportSummary = {
  importedAt: string;
  source: string | null;
  account: string | null;
  count: number;
  fromDate: string | null;
  toDate: string | null;
  totalIn: number;
  totalOut: number;
} | null;

export const getLastImportSummary = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ account: z.string().max(200).nullable().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data: input }): Promise<LastImportSummary> => {
    const acct = (input?.account ?? "").trim();
    let latestQ = supabaseAdmin
      .from("okonomi_transactions")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1);
    if (acct) latestQ = latestQ.eq("account", acct);
    const { data: latest, error: e1 } = await latestQ;
    if (e1) throw new Error(e1.message);
    if (!latest || latest.length === 0) return null;
    const latestTs = new Date(latest[0].created_at as string).getTime();
    const windowStart = new Date(latestTs - 5 * 60 * 1000).toISOString();
    let q = supabaseAdmin
      .from("okonomi_transactions")
      .select("created_at, source, account, txn_date, amount")
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (acct) q = q.eq("account", acct);
    const { data: rowsData, error } = await q;
    if (error) throw new Error(error.message);
    const rows = rowsData ?? [];
    if (rows.length === 0) return null;

    const accCount = new Map<string, number>();
    const srcCount = new Map<string, number>();
    let totalIn = 0;
    let totalOut = 0;
    let from: string | null = null;
    let to: string | null = null;
    for (const r of rows as any[]) {
      const amt = Number(r.amount ?? 0);
      if (amt >= 0) totalIn += amt;
      else totalOut += amt;
      const a = (r.account ?? "").trim() || "(ukjent)";
      accCount.set(a, (accCount.get(a) ?? 0) + 1);
      const s = (r.source ?? "").trim() || "ukjent";
      srcCount.set(s, (srcCount.get(s) ?? 0) + 1);
      const d = r.txn_date as string;
      if (d) {
        if (!from || d < from) from = d;
        if (!to || d > to) to = d;
      }
    }
    const topAcc = [...accCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const topSrc = [...srcCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      importedAt: rows[0].created_at as string,
      source: topSrc,
      account: topAcc,
      count: rows.length,
      fromDate: from,
      toDate: to,
      totalIn: Math.round(totalIn * 100) / 100,
      totalOut: Math.round(totalOut * 100) / 100,
    };
  });

// Distinct account-strings from imports, with counts.
export type ImportedAccount = { account: string; count: number };
export const listImportedAccounts = createServerFn({ method: "GET" }).handler(
  async (): Promise<ImportedAccount[]> => {
    const { data, error } = await supabaseAdmin
      .from("okonomi_transactions")
      .select("account")
      .not("account", "is", null)
      .limit(20000);
    if (error) throw new Error(error.message);
    const counts = new Map<string, number>();
    for (const r of (data ?? []) as any[]) {
      const a = (r.account ?? "").toString().trim();
      if (!a) continue;
      counts.set(a, (counts.get(a) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([account, count]) => ({ account, count }))
      .sort((a, b) => b.count - a.count);
  },
);
