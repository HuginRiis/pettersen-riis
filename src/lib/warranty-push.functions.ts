import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Sender en test-push for garanti-varsel for en valgt kvittering.
 * Bruker samme push-pipeline, men ignorerer dato/milepæl-flagg.
 */
export const sendWarrantyTestPush = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ receiptId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { sendWarrantyTestNotification } = await import("@/server/warranty-push.server");
    return sendWarrantyTestNotification(data.receiptId);
  });
