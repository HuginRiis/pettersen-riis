import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const sendMetAlertTestPush = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ prefId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { sendMetAlertTestNotification } = await import("./met-alert-push.server");
    return sendMetAlertTestNotification(data.prefId);
  });

/** Henter unike event-typer fra aktive varsler så bruker kan velge mellom dem. */
export const getMetAlertEventTypes = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchTelemarkAlertsSnapshot } = await import("./met-alerts.server");
  const r = await fetchTelemarkAlertsSnapshot();
  const map = new Map<string, string>();
  for (const a of r.alerts ?? []) {
    if (!a.event) continue;
    map.set(a.event, a.eventAwarenessName ?? a.event);
  }
  return Array.from(map.entries())
    .map(([event, label]) => ({ event, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "nb"));
});

/** Aktive farevarsler (forenklet) for visning på push-siden. */
export const getActiveMetAlerts = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchTelemarkAlertsSnapshot } = await import("./met-alerts.server");
  const r = await fetchTelemarkAlertsSnapshot();
  return (r.alerts ?? []).map((a) => ({
    id: a.id,
    event: a.event,
    label: a.eventAwarenessName ?? a.event,
    color: a.riskMatrixColor,
    area: a.area,
    countyNames: a.countyNames ?? [],
    description: a.description,
    start: a.start,
    end: a.end,
  }));
});
