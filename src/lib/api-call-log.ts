// Klient-trygg re-eksport for api-call-log.
export { getApiCallLog, refreshApiSource, getApiErrorLog } from "@/lib/api-call-log.functions";
export type { ApiErrorLog, ApiErrorEntry } from "@/lib/api-call-log.functions";
export type { ApiCallSummary, ApiCallSummaryRow } from "@/server/api-call-log.server";
