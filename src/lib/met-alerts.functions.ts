import { createServerFn } from "@tanstack/react-start";

export type { AlertGeometry, TelemarkAlert } from "./met-alerts.types";

export const getTelemarkAlerts = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchTelemarkAlertsSnapshot } = await import("@/server/met-alerts.server");
  return fetchTelemarkAlertsSnapshot();
});
