import { createFileRoute } from "@tanstack/react-router";
import { fetchJaguarSnapshot } from "@/server/jaguar.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/jaguar-poll")({
  server: {
    handlers: {
      POST: async () => {
        const snap = await fetchJaguarSnapshot();
        if (!snap.ok) {
          await supabaseAdmin.from("jaguar_snapshots").insert({
            ok: false,
            error: snap.error ?? "ukjent",
          });
          return new Response(JSON.stringify({ ok: false, error: snap.error }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        const rows = snap.vehicles.map((v) => ({
          vin: v.vin,
          ok: true,
          level: v.level,
          range_km: v.rangeKm,
          odometer_km: v.odometerKm,
          locked: v.locked,
          position_lat: v.position?.lat ?? null,
          position_lon: v.position?.lon ?? null,
          raw: v.raw as any,
        }));
        if (rows.length > 0) {
          await supabaseAdmin.from("jaguar_snapshots").insert(rows);
        }
        return new Response(JSON.stringify({ ok: true, count: rows.length }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
      GET: async () => new Response("ok"),
    },
  },
});
