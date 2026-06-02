import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import { z } from "zod";
const __load_garmin_push_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/garmin-push.server")> => import("@/lib/garmin-push.server"))
  .client((): Promise<typeof import("@/lib/garmin-push.server")> => Promise.resolve({} as unknown as typeof import("@/lib/garmin-push.server")));

export const sendGarminTestPush = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ prefId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { sendGarminTestNotification } = await __load_garmin_push_server();
    return sendGarminTestNotification(data.prefId);
  });
