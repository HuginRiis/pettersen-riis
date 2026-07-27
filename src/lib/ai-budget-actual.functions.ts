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
const __load_api_call_log_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/api-call-log.server")> => import("@/lib/api-call-log.server"))
  .client((): Promise<typeof import("@/lib/api-call-log.server")> => Promise.resolve({} as unknown as typeof import("@/lib/api-call-log.server")));
const { recordApiCall } = await __load_api_call_log_server();
const __load_house_auth = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/house-auth.server")> => import("@/lib/house-auth.server"))
  .client((): Promise<typeof import("@/lib/house-auth.server")> => Promise.resolve({ requireHouseAuth: async () => {}, isHouseAuthenticated: async () => false } as unknown as typeof import("@/lib/house-auth.server")));
const { requireHouseAuth } = await __load_house_auth();
function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type AiBudgetActual = {
  month: string;
  actualCostUsd: number;
  monthlyBudgetUsd: number;
  purchasedCreditsUsd: number;
  note: string | null;
  updatedAt: string | null;
};

export const getAiBudgetActual = createServerFn({ method: "GET" }).handler(
  async (): Promise<AiBudgetActual> => {
    await requireHouseAuth();
    const started = Date.now();
    const month = currentMonth();
    const { data, error } = await (supabaseAdmin.from("ai_budget_actual") as any)
      .select("month, actual_cost_usd, monthly_budget_usd, purchased_credits_usd, note, updated_at")
      .eq("month", month)
      .maybeSingle();
    await recordApiCall({
      source: "lovable",
      endpoint: "ai_budget_actual.get",
      ok: !error,
      duration_ms: Date.now() - started,
      error_message: error?.message ?? null,
      metadata: { month },
    });
    if (!data) {
      return { month, actualCostUsd: 0, monthlyBudgetUsd: 1, purchasedCreditsUsd: 0, note: null, updatedAt: null };
    }
    return {
      month: data.month,
      actualCostUsd: Number(data.actual_cost_usd ?? 0),
      monthlyBudgetUsd: Number(data.monthly_budget_usd ?? 1),
      purchasedCreditsUsd: Number(data.purchased_credits_usd ?? 0),
      note: data.note ?? null,
      updatedAt: data.updated_at ?? null,
    };
  },
);

export const setAiBudgetActual = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      actualCostUsd: z.number().min(0).max(10000),
      monthlyBudgetUsd: z.number().min(0).max(10000).optional(),
      purchasedCreditsUsd: z.number().min(0).max(10000).optional(),
      note: z.string().max(500).optional(),
    }).parse,
  )
  .handler(async ({ data }): Promise<AiBudgetActual> => {
    await requireHouseAuth();
    const started = Date.now();
    const month = currentMonth();
    const payload: any = {
      month,
      actual_cost_usd: data.actualCostUsd,
      monthly_budget_usd: data.monthlyBudgetUsd ?? 1,
      purchased_credits_usd: data.purchasedCreditsUsd ?? 0,
      note: data.note ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await (supabaseAdmin.from("ai_budget_actual") as any)
      .upsert(payload, { onConflict: "month" });
    await recordApiCall({
      source: "lovable",
      endpoint: "ai_budget_actual.set",
      ok: !error,
      duration_ms: Date.now() - started,
      error_message: error?.message ?? null,
      metadata: { month, actualCostUsd: data.actualCostUsd },
    });
    if (error) throw new Error(error.message);
    return {
      month,
      actualCostUsd: data.actualCostUsd,
      monthlyBudgetUsd: data.monthlyBudgetUsd ?? 1,
      purchasedCreditsUsd: data.purchasedCreditsUsd ?? 0,
      note: data.note ?? null,
      updatedAt: payload.updated_at,
    };
  });
