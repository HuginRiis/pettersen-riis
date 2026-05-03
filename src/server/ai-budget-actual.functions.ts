import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordApiCall } from "./api-call-log.server";

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type AiBudgetActual = {
  month: string;
  actualCostUsd: number;
  monthlyBudgetUsd: number;
  note: string | null;
  updatedAt: string | null;
};

export const getAiBudgetActual = createServerFn({ method: "GET" }).handler(
  async (): Promise<AiBudgetActual> => {
    const started = Date.now();
    const month = currentMonth();
    const { data, error } = await (supabaseAdmin.from("ai_budget_actual") as any)
      .select("month, actual_cost_usd, monthly_budget_usd, note, updated_at")
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
      return { month, actualCostUsd: 0, monthlyBudgetUsd: 1, note: null, updatedAt: null };
    }
    return {
      month: data.month,
      actualCostUsd: Number(data.actual_cost_usd ?? 0),
      monthlyBudgetUsd: Number(data.monthly_budget_usd ?? 1),
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
      note: z.string().max(500).optional(),
    }).parse,
  )
  .handler(async ({ data }): Promise<AiBudgetActual> => {
    const started = Date.now();
    const month = currentMonth();
    const payload: any = {
      month,
      actual_cost_usd: data.actualCostUsd,
      monthly_budget_usd: data.monthlyBudgetUsd ?? 1,
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
      note: data.note ?? null,
      updatedAt: payload.updated_at,
    };
  });
