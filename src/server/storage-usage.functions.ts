// Henter storage-bruk per bucket via SQL-funksjonen get_storage_usage_stats.
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type StorageBucket = { bucket: string; bytes: number; objects: number };

export const getStorageUsage = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ buckets: StorageBucket[]; totalBytes: number }> => {
    try {
      const { data, error } = await (supabaseAdmin as any).rpc(
        "get_storage_usage_stats",
      );
      if (error) {
        console.warn("[storage-usage] rpc failed:", error.message);
        return { buckets: [], totalBytes: 0 };
      }
      const buckets: StorageBucket[] = (data?.buckets ?? []).map((b: any) => ({
        bucket: String(b.bucket ?? ""),
        bytes: Number(b.bytes ?? 0),
        objects: Number(b.objects ?? 0),
      }));
      const totalBytes = buckets.reduce((s, b) => s + b.bytes, 0);
      return { buckets, totalBytes };
    } catch (e) {
      console.warn("[storage-usage] failed", e);
      return { buckets: [], totalBytes: 0 };
    }
  },
);
