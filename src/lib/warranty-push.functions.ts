import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const __load_warranty_push_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/server/warranty-push.server")> => import("@/server/warranty-push.server"))
  .client((): Promise<typeof import("@/server/warranty-push.server")> => Promise.resolve({} as unknown as typeof import("@/server/warranty-push.server")));

/**
 * Sender en test-push for garanti-varsel for en valgt kvittering.
 * Bruker samme push-pipeline, men ignorerer dato/milepæl-flagg.
 */
export const sendWarrantyTestPush = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ receiptId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { sendWarrantyTestNotification } = await __load_warranty_push_server();
    return sendWarrantyTestNotification(data.receiptId);
  });
