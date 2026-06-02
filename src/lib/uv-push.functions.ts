import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import { z } from "zod";
const __load_uv_push_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/uv-push.server")> => import("@/lib/uv-push.server"))
  .client((): Promise<typeof import("@/lib/uv-push.server")> => Promise.resolve({} as unknown as typeof import("@/lib/uv-push.server")));

/**
 * Sender et test-push for UV-varsel for en valgt lokasjon.
 * Bruker samme push-pipeline som de virkelige varslene, men ignorerer
 * terskler og dagens "varslet"-flagg.
 */
export const sendUvTestPush = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        prefId: z.string().uuid(),
        level: z.union([z.literal(3), z.literal(6), z.literal(8)]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { sendUvTestNotification } = await __load_uv_push_server();
    return sendUvTestNotification(data.prefId, data.level ?? 3);
  });

/**
 * Returnerer prognose for når neste UV-varsel forventes sendt for hver
 * aktiverte lokasjon (basert på MET.no-prognose og lead_minutes).
 */
export const getUvForecast = createServerFn({ method: "GET" }).handler(async () => {
  const { computeUvForecast } = await __load_uv_push_server();
  return computeUvForecast();
});

/**
 * Returnerer UV-evalueringer per aktiv lokasjon for de neste N dagene.
 * Brukt i "Kommende push-varslinger".
 */
export const getUpcomingUvEvaluations = createServerFn({ method: "GET" }).handler(async () => {
  const { computeUpcomingUvEvaluations } = await __load_uv_push_server();
  return computeUpcomingUvEvaluations(3);
});
