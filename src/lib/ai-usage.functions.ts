import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
const __load_ai_usage_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/ai-usage.server")> => import("@/lib/ai-usage.server"))
  .client((): Promise<typeof import("@/lib/ai-usage.server")> => Promise.resolve({} as unknown as typeof import("@/lib/ai-usage.server")));
const { computeAiUsageStats } = await __load_ai_usage_server();
import type { AiUsageStats } from "@/lib/ai-usage.server";
export const getAiUsageStats = createServerFn({ method: "GET" }).handler(
  async (): Promise<AiUsageStats> => {
    return computeAiUsageStats();
  },
);
