// Server-funksjoner for «Regnskap og budsjett».
import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import type {
  AccountsConfig,
  BudCategory,
  BudExpense,
  BudRule,
} from "@/lib/budsjett-shared";
import { normalizeAccountsConfig, normalizeDesc } from "@/lib/budsjett-shared";

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

const __loadAi = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/budsjett-ai.server")> => import("@/lib/budsjett-ai.server"))
  .client(
    (): Promise<typeof import("@/lib/budsjett-ai.server")> =>
      Promise.resolve({} as unknown as typeof import("@/lib/budsjett-ai.server")),
  );
const { extractStatement } = await __loadAi();

const db = () => supabaseAdmin as any;

const ACCOUNTS_KEY = "accounts.config";

export type BudsjettData = {
  cats: BudCategory[];
  expenses: BudExpense[];
  rules: BudRule[];
  accounts: AccountsConfig;
};

export const loadBudsjett = createServerFn({ method: "GET" }).handler(
  async (): Promise<BudsjettData> => {
    await requireHouseAuth();

    const [catRes, ruleRes, setRes] = await Promise.all([
      db().from("budget_categories").select("*").order("position"),
      db().from("budget_rules").select("id,pattern,category_id,hits"),
      db().from("budget_settings").select("value").eq("key", ACCOUNTS_KEY).maybeSingle(),
    ]);
    if (catRes.error) throw new Error(catRes.error.message);

    const pageSize = 1000;
    const expenses: BudExpense[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await db()
        .from("budget_expenses")
        .select("*")
        .order("occurred_on", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as BudExpense[];
      expenses.push(...rows);
      if (rows.length < pageSize) break;
    }

    return {
      cats: (catRes.data ?? []) as BudCategory[],
      expenses,
      rules: (ruleRes.data ?? []) as BudRule[],
      accounts: normalizeAccountsConfig(setRes.data?.value),
    };
  },
);

/* ------------------------------------------------------------- kategorier */

export const saveBudCategory = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      id?: string;
      name: string;
      kind: "expense" | "income";
      color?: string;
      monthly_budget?: number | null;
      yearly_budget?: number | null;
      position?: number;
    }) => d,
  )
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const patch = {
      name: data.name.trim(),
      kind: data.kind,
      color: data.color ?? "#60a5fa",
      monthly_budget: data.monthly_budget ?? null,
      yearly_budget: data.yearly_budget ?? null,
      position: data.position ?? 0,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await db().from("budget_categories").update(patch).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await db()
      .from("budget_categories")
      .insert(patch)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const setCategoryBudgets = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { updates: { id: string; monthly_budget: number; yearly_budget: number }[] }) => d,
  )
  .handler(async ({ data }) => {
    await requireHouseAuth();
    for (const u of data.updates) {
      const { error } = await db()
        .from("budget_categories")
        .update({ monthly_budget: u.monthly_budget, yearly_budget: u.yearly_budget })
        .eq("id", u.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: data.updates.length };
  });

export const deleteBudCategory = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const { error } = await db().from("budget_categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------ posteringer */

export type ExpenseInput = {
  occurred_on: string;
  category_id: string | null;
  amount: number;
  kind: "expense" | "income";
  store: string | null;
  note?: string | null;
  account?: string | null;
  created_by?: string | null;
  source?: string;
  status?: "approved" | "pending";
};

export const insertBudExpenses = createServerFn({ method: "POST" })
  .inputValidator((d: { rows: ExpenseInput[] }) => d)
  .handler(async ({ data }) => {
    await requireHouseAuth();
    let inserted = 0;
    for (let i = 0; i < data.rows.length; i += 200) {
      const batch = data.rows.slice(i, i + 200);
      const { error } = await db().from("budget_expenses").insert(batch);
      if (error) throw new Error(error.message);
      inserted += batch.length;
    }
    return { inserted };
  });

export const updateBudExpenses = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      ids: string[];
      patch: Partial<Pick<BudExpense, "category_id" | "account" | "status" | "amount" | "kind" | "store" | "note" | "occurred_on">>;
    }) => d,
  )
  .handler(async ({ data }) => {
    await requireHouseAuth();
    if (!data.ids.length) return { updated: 0 };
    const { error } = await db()
      .from("budget_expenses")
      .update({ ...data.patch, updated_at: new Date().toISOString() })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { updated: data.ids.length };
  });

export const deleteBudExpenses = createServerFn({ method: "POST" })
  .inputValidator((d: { ids: string[] }) => d)
  .handler(async ({ data }) => {
    await requireHouseAuth();
    if (!data.ids.length) return { ok: true };
    const { error } = await db().from("budget_expenses").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ regler */

export const upsertBudRule = createServerFn({ method: "POST" })
  .inputValidator((d: { desc: string | null; categoryId: string | null }) => d)
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const pattern = normalizeDesc(data.desc);
    if (!pattern || !data.categoryId) return { ok: false };
    const { data: existing } = await db()
      .from("budget_rules")
      .select("id,hits")
      .eq("pattern", pattern)
      .maybeSingle();
    if (existing) {
      await db()
        .from("budget_rules")
        .update({ category_id: data.categoryId, hits: (existing.hits ?? 0) + 1 })
        .eq("id", existing.id);
    } else {
      await db()
        .from("budget_rules")
        .insert({ pattern, category_id: data.categoryId, hits: 1 });
    }
    return { ok: true };
  });

/* ------------------------------------------------------------ innstillinger */

export const saveAccountsConfig = createServerFn({ method: "POST" })
  .inputValidator((d: { cfg: AccountsConfig }) => d)
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const { error } = await db()
      .from("budget_settings")
      .upsert(
        { key: ACCOUNTS_KEY, value: data.cfg, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* --------------------------------------------------------------- AI-import */

export const extractBankStatement = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { csvText?: string | null; fileDataUrl?: string | null; categories: string[] }) => d,
  )
  .handler(async ({ data }) => {
    await requireHouseAuth();
    return await extractStatement(data);
  });
