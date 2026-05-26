import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const sendBassengTestPush = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ prefId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const mod = await import("./basseng-push.server");
    return mod.sendBassengTestPush(data.prefId);
  });

export const runBassengCheckNow = createServerFn({ method: "POST" }).handler(async () => {
  const mod = await import("./basseng-push.server");
  return mod.processBassengNotifications(true);
});
