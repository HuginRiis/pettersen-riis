import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

type Category = "person" | "dyr" | "bil" | "pakke" | "annet";

function normalizeCategory(input: unknown): Category {
  const s = String(input ?? "").toLowerCase().trim();
  if (["person", "human", "people", "menneske"].includes(s)) return "person";
  if (["pet", "dog", "cat", "animal", "dyr", "hund", "katt"].includes(s)) return "dyr";
  if (["car", "vehicle", "bil", "kjøretøy", "kjoretoy"].includes(s)) return "bil";
  if (["package", "parcel", "pakke"].includes(s)) return "pakke";
  return "annet";
}

export const Route = createFileRoute("/api/public/hooks/eufy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Optional shared-secret check
        const expected = process.env.EUFY_WEBHOOK_TOKEN;
        if (expected) {
          const got =
            request.headers.get("x-webhook-token") ||
            request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
          if (got !== expected) {
            return new Response("Unauthorized", { status: 401 });
          }
        }

        let body: any;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        // Accept single event or array
        const items: any[] = Array.isArray(body) ? body : [body];

        const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
        const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        const rows = items.map((it) => ({
          category: normalizeCategory(it.category ?? it.type ?? it.event_type),
          camera: it.camera ?? it.device_name ?? it.device ?? null,
          source: it.source ?? "eufy",
          detected_at: it.detected_at ?? it.timestamp ?? new Date().toISOString(),
          confidence:
            typeof it.confidence === "number" ? it.confidence : null,
          snapshot_url: it.snapshot_url ?? it.image_url ?? null,
          metadata: it.metadata ?? it,
        }));

        const { error } = await supabase.from("vakttarn_events").insert(rows);
        if (error) {
          console.error("[eufy webhook] insert failed", error.message);
          return new Response(`DB error: ${error.message}`, { status: 500 });
        }

        return Response.json({ ok: true, inserted: rows.length });
      },
    },
  },
});
