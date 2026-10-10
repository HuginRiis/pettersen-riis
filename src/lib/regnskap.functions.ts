// Regnskap: import, kategorisering (AI), statistikk og kvitteringskobling.
import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import type { ParsedTx } from "@/lib/regnskap-csv";
import { dedupeKey } from "@/lib/regnskap-csv";
import { createIsomorphicFn as __claudeIso } from "@tanstack/react-start";
// Lovable AI → Claude (selvhostet): avskjæreren lastes bare på serveren.
await __claudeIso().server(() => import("@/lib/claude-gateway.server")).client(() => Promise.resolve({}))();

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

const db = () => supabaseAdmin as any;

export type FinCategory = {
  id: string;
  name: string;
  parent_id: string | null;
  kind: string;
  color: string | null;
  icon: string | null;
  sort_order: number;
};

export type FinTx = {
  id: string;
  tx_date: string;
  booked_date: string | null;
  description: string;
  counterparty: string | null;
  amount: number;
  currency: string;
  tx_type: string;
  bank_type: string | null;
  account: string | null;
  reference: string | null;
  category_id: string | null;
  ai_category: string | null;
  ai_confidence: number | null;
  ai_reason: string | null;
  needs_review: boolean;
  is_manual_category: boolean;
  comment: string | null;
  receipt_id: string | null;
  dup_status: string;
  dup_of: string | null;
  import_id: string | null;
  deleted_at: string | null;
  created_at: string;
};

const TX_SELECT =
  "id,tx_date,booked_date,description,counterparty,amount,currency,tx_type,bank_type,account,reference,category_id,ai_category,ai_confidence,ai_reason,needs_review,is_manual_category,comment,receipt_id,dup_status,dup_of,import_id,deleted_at,created_at";

/* ---------------------------------------------------------------- kategorier */

export const listFinCategories = createServerFn({ method: "GET" }).handler(
  async (): Promise<FinCategory[]> => {
    await requireHouseAuth();
    const { data, error } = await db()
      .from("fin_categories")
      .select("id,name,parent_id,kind,color,icon,sort_order")
      .order("sort_order")
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as FinCategory[];
  },
);

export const createFinCategory = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string; parent_id?: string | null; kind?: string; color?: string | null }) => d)
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const { data: row, error } = await db()
      .from("fin_categories")
      .insert({
        name: data.name.trim(),
        parent_id: data.parent_id ?? null,
        kind: data.kind ?? "expense",
        color: data.color ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const deleteFinCategory = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const { error } = await db().from("fin_categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------------------------------------------------------- transaksjoner */

export type TxFilter = {
  from?: string | null;
  to?: string | null;
  search?: string | null;
  categoryId?: string | null;
  onlyUncategorized?: boolean;
  onlyReview?: boolean;
  onlyDups?: boolean;
  onlyWithoutReceipt?: boolean;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
};

export const listFinTransactions = createServerFn({ method: "GET" })
  .inputValidator((d: TxFilter) => d ?? {})
  .handler(async ({ data }): Promise<{ rows: FinTx[]; total: number }> => {
    await requireHouseAuth();
    let q = db().from("fin_transactions").select(TX_SELECT, { count: "exact" });
    if (!data.includeDeleted) q = q.is("deleted_at", null);
    else q = q.not("deleted_at", "is", null);
    if (data.from) q = q.gte("tx_date", data.from);
    if (data.to) q = q.lte("tx_date", data.to);
    if (data.categoryId) q = q.eq("category_id", data.categoryId);
    if (data.onlyUncategorized) q = q.is("category_id", null);
    if (data.onlyReview) q = q.eq("needs_review", true);
    if (data.onlyDups) q = q.eq("dup_status", "possible");
    if (data.onlyWithoutReceipt) q = q.is("receipt_id", null);
    if (data.search) {
      const s = data.search.replace(/[%,]/g, " ");
      q = q.or(`description.ilike.%${s}%,counterparty.ilike.%${s}%,comment.ilike.%${s}%,reference.ilike.%${s}%`);
    }
    const limit = Math.min(data.limit ?? 200, 1000);
    const offset = data.offset ?? 0;
    const { data: rows, count, error } = await q
      .order("tx_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as FinTx[], total: count ?? 0 };
  });

export const updateFinTransaction = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      id: string;
      category_id?: string | null;
      tx_type?: string;
      comment?: string | null;
      needs_review?: boolean;
      receipt_id?: string | null;
      dup_status?: string;
      description?: string;
      amount?: number;
      tx_date?: string;
      learn?: boolean;
    }) => d,
  )
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const patch: Record<string, unknown> = {};
    if (data.category_id !== undefined) {
      patch.category_id = data.category_id;
      patch.is_manual_category = true;
      patch.needs_review = false;
    }
    if (data.tx_type !== undefined) patch.tx_type = data.tx_type;
    if (data.comment !== undefined) patch.comment = data.comment;
    if (data.needs_review !== undefined) patch.needs_review = data.needs_review;
    if (data.receipt_id !== undefined) patch.receipt_id = data.receipt_id;
    if (data.dup_status !== undefined) patch.dup_status = data.dup_status;
    if (data.description !== undefined) patch.description = data.description;
    if (data.amount !== undefined) patch.amount = data.amount;
    if (data.tx_date !== undefined) patch.tx_date = data.tx_date;

    const { data: row, error } = await db()
      .from("fin_transactions")
      .update(patch)
      .eq("id", data.id)
      .select(TX_SELECT)
      .single();
    if (error) throw new Error(error.message);

    // Lær av manuelle valg: mønster (mottaker/beskrivelse) → kategori
    if (data.learn && data.category_id) {
      const pattern = merchantKey(row.counterparty || row.description);
      if (pattern) {
        await db()
          .from("fin_rules")
          .upsert(
            { pattern, category_id: data.category_id, tx_type: row.tx_type, hits: 1 },
            { onConflict: "pattern" },
          );
      }
    }
    return row as FinTx;
  });

export const deleteFinTransaction = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; restore?: boolean; hard?: boolean }) => d)
  .handler(async ({ data }) => {
    await requireHouseAuth();
    if (data.hard) {
      const { error } = await db().from("fin_transactions").delete().eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await db()
      .from("fin_transactions")
      .update({ deleted_at: data.restore ? null : new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------------------------------------------------------- import */

const INTERNAL_HINTS = [
  "overføring mellom egne", "overforing mellom egne", "egen konto", "til egen", "fra egen",
  "sparekonto", "bufferkonto", "overføring innland egne",
];

function merchantKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\d{2,}/g, " ")
    .replace(/[^a-zæøå0-9 ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export type ImportResult = {
  importId: string;
  total: number;
  inserted: number;
  duplicates: number;
  possible: number;
  errors: number;
  duplicateSamples: { date: string; description: string; amount: number }[];
};

export const importFinTransactions = createServerFn({ method: "POST" })
  .inputValidator((d: { filename: string; rows: ParsedTx[]; errors?: number }) => d)
  .handler(async ({ data }): Promise<ImportResult> => {
    await requireHouseAuth();
    const rows = data.rows ?? [];

    const { data: imp, error: impErr } = await db()
      .from("fin_imports")
      .insert({ filename: data.filename, total_rows: rows.length, errors: data.errors ?? 0, status: "running" })
      .select("id")
      .single();
    if (impErr) throw new Error(impErr.message);
    const importId = imp.id as string;

    // Eksisterende nøkler i det aktuelle datointervallet
    const dates = rows.map((r) => r.tx_date).sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];
    const existing = new Set<string>();
    if (minDate) {
      const { data: ex } = await db()
        .from("fin_transactions")
        .select("dedupe_key")
        .gte("tx_date", minDate)
        .lte("tx_date", maxDate);
      for (const e of ex ?? []) if (e.dedupe_key) existing.add(e.dedupe_key as string);
    }

    // Regler for automatisk kategori
    const { data: rules } = await db().from("fin_rules").select("pattern,category_id,tx_type");
    const ruleMap = new Map<string, { category_id: string | null; tx_type: string | null }>();
    for (const r of rules ?? []) ruleMap.set(r.pattern, { category_id: r.category_id, tx_type: r.tx_type });

    const seen = new Set<string>();
    const toInsert: Record<string, unknown>[] = [];
    const dupSamples: ImportResult["duplicateSamples"] = [];
    let duplicates = 0;
    let possible = 0;

    for (const r of rows) {
      const key = dedupeKey(r.tx_date, r.description, r.amount);
      if (existing.has(key) || seen.has(key)) {
        duplicates++;
        if (dupSamples.length < 20)
          dupSamples.push({ date: r.tx_date, description: r.description, amount: r.amount });
        continue;
      }
      seen.add(key);

      const text = `${r.description} ${r.counterparty ?? ""} ${r.bank_type ?? ""}`.toLowerCase();
      const isInternal = INTERNAL_HINTS.some((h) => text.includes(h)) || Boolean(r.to_account && r.account);
      const mk = merchantKey(r.counterparty || r.description);
      const rule = ruleMap.get(mk);

      const txType = rule?.tx_type ?? (isInternal ? "internal" : r.amount >= 0 ? "income" : "expense");
      if (isInternal) possible += 0;

      toInsert.push({
        tx_date: r.tx_date,
        booked_date: r.booked_date,
        description: r.description,
        counterparty: r.counterparty,
        amount: r.amount,
        currency: r.currency || "NOK",
        tx_type: txType,
        bank_type: r.bank_type,
        bank_subtype: r.bank_subtype,
        account: r.account,
        to_account: r.to_account,
        reference: r.reference,
        bank_status: r.bank_status,
        category_id: rule?.category_id ?? null,
        needs_review: !rule?.category_id,
        is_manual_category: Boolean(rule?.category_id),
        source: "csv",
        import_id: importId,
        dedupe_key: key,
        raw: r.raw ?? {},
      });
    }

    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 400) {
      const chunk = toInsert.slice(i, i + 400);
      const { error } = await db().from("fin_transactions").insert(chunk);
      if (error) throw new Error(error.message);
      inserted += chunk.length;
    }

    // Merk mulige duplikater (samme beløp + beskrivelse innen 4 dager)
    possible = await markPossibleDuplicates(minDate, maxDate);

    await db()
      .from("fin_imports")
      .update({ inserted, duplicates, status: "ok" })
      .eq("id", importId);

    return {
      importId,
      total: rows.length,
      inserted,
      duplicates,
      possible,
      errors: data.errors ?? 0,
      duplicateSamples: dupSamples,
    };
  });

async function markPossibleDuplicates(from?: string, to?: string): Promise<number> {
  if (!from) return 0;
  const { data } = await db()
    .from("fin_transactions")
    .select("id,tx_date,description,amount,dup_status")
    .is("deleted_at", null)
    .gte("tx_date", from)
    .lte("tx_date", to ?? from);
  const rows = (data ?? []) as { id: string; tx_date: string; description: string; amount: number; dup_status: string }[];
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${merchantKey(r.description)}|${Number(r.amount).toFixed(2)}`;
    const arr = groups.get(k) ?? [];
    arr.push(r);
    groups.set(k, arr);
  }
  const flag: string[] = [];
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => a.tx_date.localeCompare(b.tx_date));
    for (let i = 1; i < arr.length; i++) {
      const d1 = new Date(arr[i - 1].tx_date).getTime();
      const d2 = new Date(arr[i].tx_date).getTime();
      if (Math.abs(d2 - d1) <= 4 * 86400000 && arr[i].dup_status === "none") flag.push(arr[i].id);
    }
  }
  if (flag.length) {
    for (let i = 0; i < flag.length; i += 200) {
      await db().from("fin_transactions").update({ dup_status: "possible" }).in("id", flag.slice(i, i + 200));
    }
  }
  return flag.length;
}

export const listFinImports = createServerFn({ method: "GET" }).handler(async () => {
  await requireHouseAuth();
  const { data, error } = await db()
    .from("fin_imports")
    .select("id,filename,imported_at,total_rows,inserted,duplicates,errors,status")
    .order("imported_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return data as {
    id: string; filename: string; imported_at: string; total_rows: number;
    inserted: number; duplicates: number; errors: number; status: string;
  }[];
});

/* ---------------------------------------------------------------- AI-kategorisering */

const AI_MODEL = "google/gemini-2.5-flash";

export const categorizeFinTransactions = createServerFn({ method: "POST" })
  .inputValidator((d: { limit?: number; ids?: string[] } | undefined) => d ?? {})
  .handler(async ({ data }): Promise<{ processed: number; updated: number; remaining: number }> => {
    await requireHouseAuth();
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY mangler");

    const { data: cats } = await db().from("fin_categories").select("id,name,parent_id,kind");
    const categories = (cats ?? []) as FinCategory[];
    const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
    const catList = categories
      .map((c) => (c.parent_id ? `${categories.find((p) => p.id === c.parent_id)?.name} > ${c.name}` : c.name))
      .join(", ");

    let q = db()
      .from("fin_transactions")
      .select("id,description,counterparty,amount,bank_type,tx_date")
      .is("deleted_at", null)
      .is("category_id", null);
    if (data.ids?.length) q = q.in("id", data.ids);
    const limit = Math.min(data.limit ?? 60, 120);
    const { data: txs, error } = await q.order("tx_date", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    const list = (txs ?? []) as { id: string; description: string; counterparty: string | null; amount: number; bank_type: string | null }[];
    if (list.length === 0) return { processed: 0, updated: 0, remaining: 0 };

    const payload = list.map((t, i) => ({
      i,
      tekst: t.description,
      mottaker: t.counterparty ?? "",
      belop: Number(t.amount),
      type: t.bank_type ?? "",
    }));

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          {
            role: "system",
            content: `Du kategoriserer norske banktransaksjoner for et privat husholdningsregnskap.
Tilgjengelige kategorier (bruk NØYAKTIG ett av disse navnene, uten "forelder > "-prefikset): ${catList}.
Regler:
- Negativt beløp = utgift, positivt = inntekt (lønn, refusjon).
- Overføringer mellom egne kontoer, sparing og kredittkortnedbetaling => kategori "Overføringer" og art "internal".
- Kjente norske aktører: Rema/Kiwi/Coop/Meny/Bunnpris/Spar/Extra = Mat og dagligvarer. Circle K/Shell/Esso/Uno-X = Drivstoff. Fjellinjen/AutoPASS/Bompenger = Bom. Netflix/Spotify/HBO/Viaplay/iCloud = Abonnementer. Telenor/Telia/Ice/Altibox = Telefon og internett. Fjordkraft/Tibber/Elvia = Strøm. Gjensidige/If/Tryg/Fremtind = Forsikring. Vipps til privatperson = Annet.
- confidence: 0-1. Sett lav confidence når du er usikker.
Svar KUN med verktøyet 'kategoriser'.`,
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "kategoriser",
              description: "Kategoriser hver transaksjon",
              parameters: {
                type: "object",
                properties: {
                  resultater: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        i: { type: "number" },
                        kategori: { type: "string" },
                        art: { type: "string", enum: ["expense", "income", "internal"] },
                        confidence: { type: "number" },
                        begrunnelse: { type: "string" },
                      },
                      required: ["i", "kategori", "art", "confidence"],
                    },
                  },
                },
                required: ["resultater"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "kategoriser" } },
      }),
    });

    if (res.status === 429) throw new Error("AI-grensen er nådd, prøv igjen om litt.");
    if (res.status === 402) throw new Error("AI-kreditt er tom. Fyll på i Lovable-innstillinger.");
    if (!res.ok) throw new Error(`AI-feil: ${res.status}`);
    const json = await res.json();
    const call = json?.choices?.[0]?.message?.tool_calls?.[0];
    const parsed = call?.function?.arguments ? JSON.parse(call.function.arguments) : { resultater: [] };
    const results: { i: number; kategori: string; art: string; confidence: number; begrunnelse?: string }[] =
      parsed.resultater ?? [];

    let updated = 0;
    for (const r of results) {
      const tx = list[r.i];
      if (!tx) continue;
      const cat = byName.get(String(r.kategori ?? "").toLowerCase()) ?? byName.get("annet");
      const conf = Number(r.confidence ?? 0);
      const { error: upErr } = await db()
        .from("fin_transactions")
        .update({
          category_id: cat?.id ?? null,
          ai_category: r.kategori ?? null,
          ai_confidence: conf,
          ai_reason: r.begrunnelse ?? null,
          tx_type: r.art ?? (tx.amount >= 0 ? "income" : "expense"),
          needs_review: conf < 0.75,
        })
        .eq("id", tx.id);
      if (!upErr) updated++;
    }

    const { count } = await db()
      .from("fin_transactions")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .is("category_id", null);

    return { processed: list.length, updated, remaining: count ?? 0 };
  });

/* ---------------------------------------------------------------- statistikk */

export const getFinStats = createServerFn({ method: "GET" })
  .inputValidator((d: { from?: string | null; to?: string | null } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const { data: res, error } = await db().rpc("fin_stats", {
      p_from: data.from ?? null,
      p_to: data.to ?? null,
    });
    if (error) throw new Error(error.message);
    return res as any;
  });

export const getFinRecurring = createServerFn({ method: "GET" }).handler(async () => {
  await requireHouseAuth();
  const { data, error } = await db().rpc("fin_recurring");
  if (error) throw new Error(error.message);
  return (data ?? []) as {
    merchant: string; count: number; avg_amount: number; frequency: string;
    interval_days: number; first_date: string; last_date: string; next_expected: string; yearly_cost: number;
  }[];
});

/* ---------------------------------------------------------------- kvitteringer */

export type FinReceipt = {
  id: string;
  store: string | null;
  purchased_at: string | null;
  total_nok: number | null;
  image_url: string;
  is_food: boolean;
};

export const listFinReceipts = createServerFn({ method: "GET" }).handler(async (): Promise<FinReceipt[]> => {
  await requireHouseAuth();
  const { data, error } = await db()
    .from("receipts")
    .select("id,store,purchased_at,total_nok,image_url,is_food")
    .order("purchased_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as FinReceipt[];
});

/** Foreslår/kobler kvitteringer automatisk mot transaksjoner (dato ±3 dager, samme beløp). */
export const autoMatchReceipts = createServerFn({ method: "POST" })
  .inputValidator((d: { apply?: boolean } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const { data: receipts } = await db()
      .from("receipts")
      .select("id,store,purchased_at,total_nok")
      .not("purchased_at", "is", null)
      .not("total_nok", "is", null);
    const { data: txs } = await db()
      .from("fin_transactions")
      .select("id,tx_date,description,counterparty,amount")
      .is("deleted_at", null)
      .is("receipt_id", null)
      .lt("amount", 0);

    const matches: { receipt_id: string; tx_id: string; store: string | null; date: string; amount: number }[] = [];
    const usedTx = new Set<string>();
    for (const r of (receipts ?? []) as any[]) {
      const target = Math.abs(Number(r.total_nok));
      const rd = new Date(r.purchased_at).getTime();
      const hit = ((txs ?? []) as any[]).find(
        (t) =>
          !usedTx.has(t.id) &&
          Math.abs(Math.abs(Number(t.amount)) - target) < 0.5 &&
          Math.abs(new Date(t.tx_date).getTime() - rd) <= 3 * 86400000,
      );
      if (hit) {
        usedTx.add(hit.id);
        matches.push({ receipt_id: r.id, tx_id: hit.id, store: r.store, date: hit.tx_date, amount: Number(hit.amount) });
      }
    }

    if (data.apply) {
      for (const m of matches) {
        await db().from("fin_transactions").update({ receipt_id: m.receipt_id }).eq("id", m.tx_id);
      }
    }
    return { count: matches.length, matches: matches.slice(0, 50), applied: Boolean(data.apply) };
  });

/** Kobler én kvittering til én transaksjon (manuelt valg fra veiviser/forslag). */
export const linkReceiptToTx = createServerFn({ method: "POST" })
  .inputValidator((d: { tx_id: string; receipt_id: string | null }) => d)
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const { error } = await db()
      .from("fin_transactions")
      .update({ receipt_id: data.receipt_id })
      .eq("id", data.tx_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type WizardGroup = {
  pattern: string;
  label: string;
  count: number;
  total: number;
  ids: string[];
  state: "missing" | "annet";
  samples: { date: string; description: string; amount: number }[];
};

/** Grupperer transaksjoner uten kategori + de som havnet i "Annet", til veiviseren. */
export const listCategoryWizardGroups = createServerFn({ method: "GET" })
  .inputValidator((d: { includeAnnet?: boolean } | undefined) => d ?? {})
  .handler(async ({ data }): Promise<WizardGroup[]> => {
    await requireHouseAuth();
    const { data: cats } = await db().from("fin_categories").select("id,name");
    const annet = (cats ?? []).find((c: any) => String(c.name).toLowerCase() === "annet");
    const includeAnnet = data.includeAnnet !== false;

    const { data: rows, error } = await db()
      .from("fin_transactions")
      .select("id,tx_date,description,counterparty,amount,category_id")
      .is("deleted_at", null)
      .order("tx_date", { ascending: false })
      .limit(3000);
    if (error) throw new Error(error.message);

    const map = new Map<string, WizardGroup>();
    for (const t of (rows ?? []) as any[]) {
      const isMissing = !t.category_id;
      const isAnnet = annet && t.category_id === annet.id;
      if (!isMissing && !(includeAnnet && isAnnet)) continue;
      const label = (t.counterparty || t.description || "").trim() || "Ukjent";
      const key = merchantKey(label) || "ukjent";
      let g = map.get(key);
      if (!g) {
        g = { pattern: key, label, count: 0, total: 0, ids: [], state: isMissing ? "missing" : "annet", samples: [] };
        map.set(key, g);
      }
      g.count++;
      g.total += Number(t.amount) || 0;
      g.ids.push(t.id);
      if (isMissing) g.state = "missing";
      if (g.samples.length < 3)
        g.samples.push({ date: t.tx_date, description: t.description, amount: Number(t.amount) });
    }
    return [...map.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  });

/** Setter kategori på en hel gruppe og husker valget som regel til neste gang. */
export const applyWizardChoice = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { ids: string[]; pattern: string; category_id: string | null; tx_type?: string; remember?: boolean }) => d,
  )
  .handler(async ({ data }) => {
    await requireHouseAuth();
    if (!data.ids?.length) return { updated: 0 };
    const patch: Record<string, unknown> = {
      category_id: data.category_id,
      is_manual_category: true,
      needs_review: false,
    };
    if (data.tx_type) patch.tx_type = data.tx_type;
    const { error } = await db().from("fin_transactions").update(patch).in("id", data.ids);
    if (error) throw new Error(error.message);

    if (data.remember !== false && data.pattern && data.category_id) {
      await db()
        .from("fin_rules")
        .upsert(
          { pattern: data.pattern, category_id: data.category_id, tx_type: data.tx_type ?? null, hits: data.ids.length },
          { onConflict: "pattern" },
        );
    }
    return { updated: data.ids.length };
  });
