import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const sendGarminTestPush = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ prefId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { sendGarminTestNotification } = await import("./garmin-push.server");
    return sendGarminTestNotification(data.prefId);
  });
