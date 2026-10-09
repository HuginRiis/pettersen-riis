import { createFileRoute } from "@tanstack/react-router";

// Midlertidig eksportverktøy for datamigrering. Krever x-export-token == EXPORT_TOKEN.
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const Route = createFileRoute("/api/public/data-export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const expected = process.env.EXPORT_TOKEN;
        const token = request.headers.get("x-export-token");
        if (!expected || !token || token !== expected) return json({ error: "unauthorized" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        const url = new URL(request.url);
        const action = url.searchParams.get("action");

        try {
          if (action === "tables") {
            const { data, error } = await db.rpc("export_list_tables");
            if (error) throw error;
            return json(data);
          }
          if (action === "rows") {
            const table = url.searchParams.get("table") ?? "";
            const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
            const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get("limit") ?? "1000", 10) || 1000));
            const { data: tables, error: tErr } = await db.rpc("export_list_tables");
            if (tErr) throw tErr;
            if (!(tables as { table: string }[]).some((t) => t.table === table))
              return json({ error: "unknown table" }, 400);
            const { data, error } = await db.rpc("export_table_rows", {
              p_table: table,
              p_offset: offset,
              p_limit: limit,
            });
            if (error) throw error;
            return json(data);
          }
          if (action === "buckets") {
            const { data, error } = await db.storage.listBuckets();
            if (error) throw error;
            return json((data ?? []).map((b: any) => ({ id: b.id, public: b.public })));
          }
          if (action === "files") {
            const bucket = url.searchParams.get("bucket") ?? "";
            const { data: buckets } = await db.storage.listBuckets();
            if (!(buckets ?? []).some((b: any) => b.id === bucket)) return json({ error: "unknown bucket" }, 400);
            const paths: string[] = [];
            const walk = async (prefix: string) => {
              for (let off = 0; ; off += 1000) {
                const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset: off });
                if (error) throw error;
                for (const item of data ?? []) {
                  const p = prefix ? `${prefix}/${item.name}` : item.name;
                  if (item.id === null) await walk(p);
                  else paths.push(p);
                }
                if (!data || data.length < 1000) break;
              }
            };
            await walk("");
            const out: { path: string; url: string | null }[] = [];
            for (let i = 0; i < paths.length; i += 500) {
              const chunk = paths.slice(i, i + 500);
              const { data, error } = await db.storage.from(bucket).createSignedUrls(chunk, 3600);
              if (error) throw error;
              chunk.forEach((p, j) => out.push({ path: p, url: data?.[j]?.signedUrl ?? null }));
            }
            return json(out);
          }
          if (action === "cron") {
            const { data, error } = await db.rpc("get_cron_jobs");
            if (error) throw error;
            return json(
              (data ?? []).map((j: any) => ({ jobname: j.jobname, schedule: j.schedule, command: j.command })),
            );
          }
          return json({ error: "unknown action" }, 400);
        } catch (e: any) {
          return json({ error: e?.message ?? "error" }, 500);
        }
      },
    },
  },
});
