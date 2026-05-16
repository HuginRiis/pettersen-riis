import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Ugyldig tid");

export const getPushQuietHours = createServerFn({ method: "GET" })
  .handler(async () => {
    const { listQuietHours } = await import("./push-quiet-hours.server");
    return { rows: await listQuietHours() };
  });

export const setPushQuietHours = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      recipient: z.string().min(1).max(64),
      enabled: z.boolean(),
      weekday_start: TIME,
      weekday_end: TIME,
      weekend_start: TIME,
      weekend_end: TIME,
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { upsertQuietHoursDb } = await import("./push-quiet-hours.server");
    await upsertQuietHoursDb(data);
    return { ok: true };
  });

export const deletePushQuietHours = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ recipient: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data }) => {
    const { deleteQuietHoursDb } = await import("./push-quiet-hours.server");
    await deleteQuietHoursDb(data.recipient);
    return { ok: true };
  });
