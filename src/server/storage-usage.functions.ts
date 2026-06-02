// Henter storage-bruk per bucket via SQL-funksjonen get_storage_usage_stats.
import { createServerFn } from "@tanstack/react-start";
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

export type StorageBucket = { bucket: string; bytes: number; objects: number };
export type StorageObject = {
  name: string;
  bytes: number;
  updated_at: string | null;
};

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

// Henter de største filene i en gitt bucket — direkte fra storage.objects.
export const getBucketObjects = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        bucket: z.string().min(1).max(120),
        limit: z.number().int().min(1).max(200).default(25),
      })
      .parse(d),
  )
  .handler(
    async ({ data }): Promise<{ objects: StorageObject[]; totalBytes: number }> => {
      try {
        const { data: rows, error } = await (supabaseAdmin as any)
          .schema("storage")
          .from("objects")
          .select("name, metadata, updated_at")
          .eq("bucket_id", data.bucket)
          .limit(1000);
        if (error) {
          console.warn("[bucket-objects] failed:", error.message);
          return { objects: [], totalBytes: 0 };
        }
        const all: StorageObject[] = (rows ?? []).map((r: any) => ({
          name: String(r.name ?? ""),
          bytes: Number(r?.metadata?.size ?? 0),
          updated_at: r?.updated_at ?? null,
        }));
        all.sort((a, b) => b.bytes - a.bytes);
        const totalBytes = all.reduce((s, o) => s + o.bytes, 0);
        return { objects: all.slice(0, data.limit), totalBytes };
      } catch (e) {
        console.warn("[bucket-objects] failed", e);
        return { objects: [], totalBytes: 0 };
      }
    },
  );
