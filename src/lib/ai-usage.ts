// Client-safe re-exports for AI usage stats. The actual implementation
// (which touches the service-role Supabase client) lives in
// `ai-usage.server.ts` — never import that from client code.
export { getAiUsageStats } from "@/lib/ai-usage.functions";
export type { AiUsageStats, AiUsageRow } from "@/lib/ai-usage.server";
