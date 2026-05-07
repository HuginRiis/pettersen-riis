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
  const { getTelemarkAlerts } = await import("./met-alerts");
  const r = await getTelemarkAlerts();
  const map = new Map<string, string>();
  for (const a of r.alerts ?? []) {
    if (!a.event) continue;
    map.set(a.event, a.eventAwarenessName ?? a.event);
  }
  return Array.from(map.entries())
    .map(([event, label]) => ({ event, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "nb"));
});
