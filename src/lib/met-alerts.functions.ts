import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
const __load_met_alerts_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/met-alerts.server")> => import("@/lib/met-alerts.server"))
  .client((): Promise<typeof import("@/lib/met-alerts.server")> => Promise.resolve({} as unknown as typeof import("@/lib/met-alerts.server")));

export type { AlertGeometry, TelemarkAlert } from "./met-alerts.types";

export const getTelemarkAlerts = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchTelemarkAlertsSnapshot } = await __load_met_alerts_server();
  return fetchTelemarkAlertsSnapshot();
});
