import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const __load_basseng_push_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/server/basseng-push.server")> => import("@/server/basseng-push.server"))
  .client((): Promise<typeof import("@/server/basseng-push.server")> => Promise.resolve({} as unknown as typeof import("@/server/basseng-push.server")));

export const sendBassengTestPush = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ prefId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const mod = await __load_basseng_push_server();
    return mod.sendBassengTestPush(data.prefId);
  });

export const runBassengCheckNow = createServerFn({ method: "POST" }).handler(async () => {
  const mod = await __load_basseng_push_server();
  return mod.processBassengNotifications(true);
});
