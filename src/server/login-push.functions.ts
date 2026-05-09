import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const sendLoginTestPush = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ prefId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { sendLoginTestNotification } = await import("./login-push.server");
    return sendLoginTestNotification(data.prefId);
  });
