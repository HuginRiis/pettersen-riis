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
          let garmin: any = { per_owner: [] as any[] };
          try {
            const gmod = await import("@/server/garmin-sync.server");
            const { GARMIN_OWNERS } = await import("@/server/garmin.shared");
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const localHourStr = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", hour12: false }).format(new Date());
            const localHour = parseInt(localHourStr, 10);
            const localMinStr = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", minute: "2-digit", hour12: false }).format(new Date());
            const localMin = parseInt(localMinStr, 10);
            const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
            const nowMinutes = localHour * 60 + localMin;
            const keys = GARMIN_OWNERS.flatMap((o) => [`garmin_sync_schedule_${o}`, `garmin_extra_sync_last_${o}`, "garmin_sync_schedule"]);
            const { data: rows } = await supabaseAdmin
              .from("notification_settings").select("key, value").in("key", keys);
            const byKey = new Map<string, any>();
            for (const r of (rows ?? []) as Array<{ key: string; value: any }>) byKey.set(r.key, r.value);
            const out: any[] = [];
            for (const owner of GARMIN_OWNERS) {
              const sched = byKey.get(`garmin_sync_schedule_${owner}`) ?? byKey.get("garmin_sync_schedule") ?? null;

              // Extra sync: trigger if enabled, current local time is within +0..15 min after configured time, and not yet run today
              if (sched?.extra_sync_enabled && typeof sched.extra_sync_time === "string" && /^\d{2}:\d{2}$/.test(sched.extra_sync_time)) {
                const [eh, em] = sched.extra_sync_time.split(":").map((s: string) => parseInt(s, 10));
                const extraMinutes = eh * 60 + em;
                const lastDay = (byKey.get(`garmin_extra_sync_last_${owner}`) as { day?: string } | null)?.day ?? null;
                if (nowMinutes >= extraMinutes && nowMinutes - extraMinutes <= 15 && lastDay !== localDay) {
                  const res = await gmod.syncOne(owner, "cron-extra");
                  await supabaseAdmin.from("notification_settings").upsert(
                    [{ key: `garmin_extra_sync_last_${owner}`, value: { day: localDay, ran_at: new Date().toISOString() }, updated_at: new Date().toISOString() }],
                    { onConflict: "key" },
                  );
                  out.push({ ...res, extra: true });
                  continue;
                }
              }

              // Hard nighttime block 21:00-05:59 — applies only to interval-based sync
              if (localHour >= 21 || localHour < 6) {
                out.push({ owner, skipped: true, reason: `nighttime block (now ${localHour}:00, only 06–20)` });
                continue;
              }
              const intervalMin = Math.max(15, Math.min(1440, sched?.interval_minutes ?? 60));
              const firstH = Math.max(6, sched?.first_local_hour ?? 6);
              const lastH = Math.min(20, sched?.last_local_hour ?? 20);
              const inWindow = localHour >= firstH && localHour <= lastH;
              if (!inWindow) {
                out.push({ owner, skipped: true, reason: `outside window (${firstH}-${lastH}, now ${localHour})` });
                continue;
              }
              const { data: lastOk } = await supabaseAdmin
                .from("garmin_sync_log").select("ran_at").eq("owner", owner).eq("ok", true)
                .order("ran_at", { ascending: false }).limit(1).maybeSingle();
              const lastMs = lastOk?.ran_at ? new Date(lastOk.ran_at).getTime() : 0;
              const dueMs = lastMs + intervalMin * 60_000;
              if (Date.now() >= dueMs) {
                out.push(await gmod.syncOne(owner, "cron"));
              } else {
                out.push({ owner, skipped: true, reason: `interval ${intervalMin}m not elapsed`, next_at: new Date(dueMs).toISOString() });
              }
            }
            garmin = { per_owner: out };
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
          let plants = { checked: 0, sent: 0, errors: 0, skipped: 0 };
          try {
            const pmod = await import("@/server/plants-push.server");
            plants = await pmod.processPlantsNotifications();
          } catch (err) {
            console.error("[plants-push] failed", err);
          }
          let garminThresholds = { checked: 0, sent: 0, errors: 0, skipped: 0 };
          try {
            const gtmod = await import("@/server/garmin-thresholds.server");
            garminThresholds = await gtmod.processGarminThresholdNotifications();
          } catch (err) {
            console.error("[garmin-thresholds] failed", err);
          }
          let sensorSummary = { checked: 0, sent: 0, errors: 0, skipped: 0 };
          try {
            const smod = await import("@/server/homey-sensor-summary.server");
            sensorSummary = await smod.processHomeySensorSummary();
          } catch (err) {
            console.error("[homey-sensor-summary] failed", err);
          }
          let sensorHistory = { checked: 0, ran: false, skipped: 1 } as any;
          try {
            const hmod = await import("@/server/homey-sensor-backfill.server");
            sensorHistory = await hmod.processHomeySensorHistoryCron();
          } catch (err) {
            console.error("[homey-sensor-history] failed", err);
          }
          let slowPage = { checked: 0, sent: 0, errors: 0, skipped: 0 };
          try {
            const spmod = await import("@/server/slow-page-push.server");
            slowPage = await spmod.processSlowPageLoadNotifications();
          } catch (err) {
            console.error("[slow-page-push] failed", err);
          }
          return new Response(JSON.stringify({ ok: true, agenda, checklist, garbage, birthdays, warranty, uv, weather, lightIdle, tibber, metAlerts, mailDelivery, garmin, garminPush, garminThresholds, plants, sensorSummary, sensorHistory, slowPage }), {
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
