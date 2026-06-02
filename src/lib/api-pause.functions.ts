// Klient-trygge serverFn for pause-flagg per API-kilde.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const __load_api_pause_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/server/api-pause.server")> => import("@/server/api-pause.server"))
  .client((): Promise<typeof import("@/server/api-pause.server")> => Promise.resolve({} as unknown as typeof import("@/server/api-pause.server")));
const { listApiPauseFlags, setApiSourcePausedDb } = await __load_api_pause_server();
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
