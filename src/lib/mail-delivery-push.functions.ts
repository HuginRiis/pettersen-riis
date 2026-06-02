import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const __load_mail_delivery_push_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/server/mail-delivery-push.server")> => import("@/server/mail-delivery-push.server"))
  .client((): Promise<typeof import("@/server/mail-delivery-push.server")> => Promise.resolve({} as unknown as typeof import("@/server/mail-delivery-push.server")));

export const getMailDeliveryOverview = createServerFn({ method: "GET" }).handler(async () => {
  const mod = await __load_mail_delivery_push_server();
  return mod.getMailDeliveryOverview();
});

export const sendMailDeliveryTestPush = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ prefId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const mod = await __load_mail_delivery_push_server();
    return mod.sendMailDeliveryTestPush(data.prefId);
  });
