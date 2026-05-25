import { createFileRoute } from "@tanstack/react-router";
import { getNetatmoClimateHistory } from "@/server/netatmo-history";

/**
 * Kjøres av pg_cron hvert 20. min for å fylle DB-cachen
 * (public.netatmo_climate_snapshot) med fersk Netatmo-historikk for
 * tollnes (Borgen) og hytta. Brukes som fallback når Netatmo-API svikter.
 *
 * Kjører i tillegg klima-push-evaluering (for varmt / for kaldt) basert på
 * `climate_notification_prefs`.
 */
export const Route = createFileRoute("/api/public/hooks/netatmo-climate-refresh")({
  server: {
    handlers: {
      POST: async () => {
        const stations = ["tollnes", "hytta"];
        const results: Array<{ station: string; ok: boolean; error?: string }> = [];
        for (const s of stations) {
          try {
            const r = await (getNetatmoClimateHistory as any)({ data: { stationMatch: s } });
            results.push({ station: s, ok: !!r?.ok, error: r?.ok ? undefined : r?.error });
          } catch (e: any) {
            results.push({ station: s, ok: false, error: e?.message ?? "unknown" });
          }
        }

        let climate: unknown = null;
        try {
          const { processClimateNotifications } = await import("@/server/climate-push.server");
          climate = await processClimateNotifications();
        } catch (e: any) {
          climate = { ok: false, error: e?.message ?? "unknown" };
        }

        return new Response(JSON.stringify({ ok: true, results, climate }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
