import { createServerFn } from "@tanstack/react-start";
import { computeAiUsageStats, type AiUsageStats } from "@/server/ai-usage.server";

export const getAiUsageStats = createServerFn({ method: "GET" }).handler(
  async (): Promise<AiUsageStats> => {
    return computeAiUsageStats();
  },
);
