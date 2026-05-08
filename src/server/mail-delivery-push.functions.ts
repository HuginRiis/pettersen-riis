import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getMailDeliveryOverview = createServerFn({ method: "GET" }).handler(async () => {
  const mod = await import("./mail-delivery-push.server");
  return mod.getMailDeliveryOverview();
});

export const sendMailDeliveryTestPush = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ prefId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const mod = await import("./mail-delivery-push.server");
    return mod.sendMailDeliveryTestPush(data.prefId);
  });
