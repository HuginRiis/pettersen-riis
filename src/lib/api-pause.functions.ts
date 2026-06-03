// Klient-trygge serverFn for pause-flagg per API-kilde.
import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import { z } from "zod";
const __load_api_pause_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/api-pause.server")> => import("@/lib/api-pause.server"))
  .client((): Promise<typeof import("@/lib/api-pause.server")> => Promise.resolve({} as unknown as typeof import("@/lib/api-pause.server")));
const { listApiPauseFlags, setApiSourcePausedDb, setApiSourceWindowDb } = await __load_api_pause_server();

export type ApiPauseFlag = {
  source: string;
  paused: boolean;
  window_enabled: boolean;
  start_time: string;
  end_time: string;
  updated_at: string;
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

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

export const setApiSourceWindow = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        source: z.string().min(1).max(64),
        window_enabled: z.boolean(),
        start_time: z.string().regex(TIME_RE, "Format må være HH:MM"),
        end_time: z.string().regex(TIME_RE, "Format må være HH:MM"),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await setApiSourceWindowDb(data.source, data.window_enabled, data.start_time, data.end_time);
    return data;
  });
