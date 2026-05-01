import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Sender et test-push for UV-varsel for en valgt lokasjon.
 * Bruker samme push-pipeline som de virkelige varslene, men ignorerer
 * terskler og dagens "varslet"-flagg.
 */
export const sendUvTestPush = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        prefId: z.string().uuid(),
        level: z.union([z.literal(3), z.literal(6), z.literal(8)]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { sendUvTestNotification } = await import("./uv-push.server");
    return sendUvTestNotification(data.prefId, data.level ?? 3);
  });
