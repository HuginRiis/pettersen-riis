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
          return new Response(JSON.stringify({ ok: true, agenda, checklist, garbage, birthdays, warranty }), {
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
