import { createFileRoute } from "@tanstack/react-router";
import { processAgendaNotifications } from "@/server/agenda-push";

export const Route = createFileRoute("/api/public/hooks/agenda-push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
        const accepted = [
          process.env.AGENDA_PUSH_HOOK_TOKEN,
          process.env.SUPABASE_ANON_KEY,
          process.env.SUPABASE_PUBLISHABLE_KEY,
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        ].filter(Boolean) as string[];
        if (!token || accepted.length === 0 || !accepted.includes(token)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const agenda = await processAgendaNotifications();
          let checklist = { checked: 0, sent: 0, errors: 0 };
          try {
            const mod = await import("@/server/agenda-push.server");
            checklist = await mod.processHyttaChecklistNotifications();
          } catch (err) {
            console.error("[hytta-checklist-push] failed", err);
          }
          let garbage = { checked: 0, sent: 0, errors: 0, skipped: 0 };
          try {
            const gmod = await import("@/server/garbage-collection.server");
            garbage = await gmod.processGarbageNotifications();
          } catch (err) {
            console.error("[garbage-push] failed", err);
          }
          let birthdays = { checked: 0, sent: 0, errors: 0 };
          try {
            const bmod = await import("@/server/birthdays.server");
            birthdays = await bmod.processBirthdayNotifications();
          } catch (err) {
            console.error("[birthday-push] failed", err);
          }
          let warranty = { checked: 0, sent: 0, errors: 0 };
          try {
            const wmod = await import("@/server/warranty-push.server");
            warranty = await wmod.processWarrantyNotifications();
          } catch (err) {
            console.error("[warranty-push] failed", err);
          }
          let uv = { checked: 0, sent: 0, errors: 0, skipped: 0 };
          try {
            const umod = await import("@/server/uv-push.server");
            uv = await umod.processUvNotifications();
          } catch (err) {
            console.error("[uv-push] failed", err);
          }
          let weather = { checked: 0, sent: 0, errors: 0, skipped: 0 };
          try {
            const wmod = await import("@/server/weather-push.server");
            weather = await wmod.processWeatherNotifications();
          } catch (err) {
            console.error("[weather-push] failed", err);
          }
          let lightIdle = { checked: 0, sent: 0, errors: 0, skipped: 0 };
          try {
            const lmod = await import("@/server/light-idle-push.server");
            lightIdle = await lmod.processLightIdleNotifications();
          } catch (err) {
            console.error("[light-idle-push] failed", err);
          }
          let tibber = { checked: 0, sent: 0, errors: 0, skipped: 0 };
          try {
            const tmod = await import("@/server/tibber-push.server");
            tibber = await tmod.processTibberNotifications();
          } catch (err) {
            console.error("[tibber-push] failed", err);
          }
          let metAlerts = { checked: 0, sent: 0, errors: 0, skipped: 0 };
          try {
            const mmod = await import("@/server/met-alert-push.server");
            metAlerts = await mmod.processMetAlertNotifications();
          } catch (err) {
            console.error("[met-alert-push] failed", err);
          }
          let mailDelivery = { checked: 0, sent: 0, errors: 0, skipped: 0 };
          try {
            const mdmod = await import("@/server/mail-delivery-push.server");
            mailDelivery = await mdmod.processMailDeliveryNotifications();
          } catch (err) {
            console.error("[mail-delivery-push] failed", err);
          }
          let garmin: any = { skipped: true };
          try {
            const gmod = await import("@/server/garmin-sync.server");
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: schedRow } = await supabaseAdmin
              .from("notification_settings").select("value").eq("key", "garmin_sync_schedule").maybeSingle();
            const sched = (schedRow?.value as { interval_minutes?: number; first_local_hour?: number; last_local_hour?: number } | null) ?? null;
            const intervalMin = sched?.interval_minutes ?? 1440;
            const firstH = sched?.first_local_hour ?? 6;
            const lastH = sched?.last_local_hour ?? 23;
            const localHourStr = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", hour12: false }).format(new Date());
            const localHour = parseInt(localHourStr, 10);
            const inWindow = firstH <= lastH ? (localHour >= firstH && localHour <= lastH) : (localHour >= firstH || localHour <= lastH);
            if (!inWindow) {
              garmin = { skipped: true, reason: `outside window (${firstH}-${lastH}, now ${localHour})` };
            } else {
              const { data: lastOk } = await supabaseAdmin
                .from("garmin_sync_log").select("ran_at").eq("ok", true)
                .order("ran_at", { ascending: false }).limit(1).maybeSingle();
              const lastMs = lastOk?.ran_at ? new Date(lastOk.ran_at).getTime() : 0;
              const dueMs = lastMs + intervalMin * 60_000;
              if (Date.now() >= dueMs) {
                garmin = await gmod.syncAll("cron");
              } else {
                garmin = { skipped: true, reason: `interval ${intervalMin}m not elapsed`, next_at: new Date(dueMs).toISOString() };
              }
            }
          } catch (err) {
            console.error("[garmin-sync] failed", err);
            garmin = { ok: false, error: String(err) };
          }
          let garminPush = { checked: 0, sent: 0, errors: 0, skipped: 0 };
          try {
            const gpmod = await import("@/server/garmin-push.server");
            garminPush = await gpmod.processGarminNotifications();
          } catch (err) {
            console.error("[garmin-push] failed", err);
          }
          return new Response(JSON.stringify({ ok: true, agenda, checklist, garbage, birthdays, warranty, uv, weather, lightIdle, tibber, metAlerts, mailDelivery, garmin, garminPush }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[agenda-push] failed", err);
          return new Response(JSON.stringify({ ok: false, error: String(err) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
