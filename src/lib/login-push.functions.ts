import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import { z } from "zod";
const __load_login_push_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/login-push.server")> => import("@/lib/login-push.server"))
  .client((): Promise<typeof import("@/lib/login-push.server")> => Promise.resolve({} as unknown as typeof import("@/lib/login-push.server")));

export const sendLoginTestPush = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ prefId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { sendLoginTestNotification } = await __load_login_push_server();
    return sendLoginTestNotification(data.prefId);
  });
