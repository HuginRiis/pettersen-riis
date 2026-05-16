// Klient-trygge serverFn for pause-flagg per API-kilde.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  listApiPauseFlags,
  setApiSourcePausedDb,
} from "./api-pause.server";

export type ApiPauseFlag = { source: string; paused: boolean; updated_at: string };

export const getApiPauseFlags = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ flags: ApiPauseFlag[] }> => {
    const flags = await listApiPauseFlags();
    return { flags };
  },
);

export const setApiSourcePaused = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        source: z.string().min(1).max(64),
        paused: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ source: string; paused: boolean }> => {
    await setApiSourcePausedDb(data.source, data.paused);
    return { source: data.source, paused: data.paused };
  });
