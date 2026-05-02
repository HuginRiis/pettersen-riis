import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Category = "person" | "dyr" | "bil" | "pakke" | "annet";

function normalizeCategory(input: unknown): Category {
  const s = String(input ?? "").toLowerCase().trim();
  if (["person", "human", "people", "menneske"].includes(s)) return "person";
  if (["pet", "dog", "cat", "animal", "dyr", "hund", "katt"].includes(s)) return "dyr";
  if (["car", "vehicle", "bil", "kjøretøy", "kjoretoy"].includes(s)) return "bil";
  if (["package", "parcel", "pakke"].includes(s)) return "pakke";
  return "annet";
}

async function handle(request: Request): Promise<Response> {
  try {
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

    // Try JSON, fall back to query params or form data so even a bare GET works
    let body: any = {};
    const url = new URL(request.url);
    const ct = request.headers.get("content-type") ?? "";

    if (request.method !== "GET") {
      const raw = await request.text();
      if (raw) {
        if (ct.includes("application/json")) {
          try { body = JSON.parse(raw); } catch { body = { raw }; }
        } else if (ct.includes("application/x-www-form-urlencoded")) {
          body = Object.fromEntries(new URLSearchParams(raw));
        } else {
          try { body = JSON.parse(raw); } catch { body = { raw }; }
        }
      }
    }

    // Merge query string (so ?category=person&camera=Inngang works too)
    for (const [k, v] of url.searchParams.entries()) {
      if (body[k] === undefined) body[k] = v;
    }

    const items: any[] = Array.isArray(body) ? body : [body];

    const rows = items.map((it) => ({
      category: normalizeCategory(it.category ?? it.type ?? it.event_type),
      camera: it.camera ?? it.device_name ?? it.device ?? null,
      source: it.source ?? "eufy",
      detected_at: it.detected_at ?? it.timestamp ?? new Date().toISOString(),
      confidence: typeof it.confidence === "number" ? it.confidence : null,
      snapshot_url: it.snapshot_url ?? it.image_url ?? null,
      metadata: it.metadata ?? it,
    }));

    const { error } = await supabaseAdmin.from("vakttarn_events").insert(rows);
    if (error) {
      console.error("[eufy webhook] insert failed:", error.message);
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }

    console.log(`[eufy webhook] inserted ${rows.length} event(s):`, rows.map(r => `${r.category}@${r.camera ?? "?"}`).join(", "));
    return Response.json({ ok: true, inserted: rows.length });
  } catch (err: any) {
    console.error("[eufy webhook] unhandled error:", err?.message, err?.stack);
    return Response.json({ ok: false, error: err?.message ?? "unknown" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/hooks/eufy")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
