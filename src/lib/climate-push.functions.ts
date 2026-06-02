import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const __load_climate_push_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/server/climate-push.server")> => import("@/server/climate-push.server"))
  .client((): Promise<typeof import("@/server/climate-push.server")> => Promise.resolve({} as unknown as typeof import("@/server/climate-push.server")));

export const sendClimateTestPush = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ prefId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const mod = await __load_climate_push_server();
    return mod.sendClimateTestPush(data.prefId);
  });

export const runClimateCheckNow = createServerFn({ method: "POST" }).handler(async () => {
  const mod = await __load_climate_push_server();
  return mod.processClimateNotifications();
});
