import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const sendClimateTestPush = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ prefId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const mod = await import("./climate-push.server");
    return mod.sendClimateTestPush(data.prefId);
  });

export const runClimateCheckNow = createServerFn({ method: "POST" }).handler(async () => {
  const mod = await import("./climate-push.server");
  return mod.processClimateNotifications();
});
