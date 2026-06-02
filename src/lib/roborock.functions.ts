import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
const __load_roborock_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/server/roborock.server")> => import("@/server/roborock.server"))
  .client((): Promise<typeof import("@/server/roborock.server")> => Promise.resolve({} as unknown as typeof import("@/server/roborock.server")));
const { fetchRoborockSnapshot, requestLoginCode, verifyLoginCode, loginWithPassword, sendDeviceCommand } = await __load_roborock_server();
const __load_api_call_log_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/server/api-call-log.server")> => import("@/server/api-call-log.server"))
  .client((): Promise<typeof import("@/server/api-call-log.server")> => Promise.resolve({} as unknown as typeof import("@/server/api-call-log.server")));
const { withApiLog } = await __load_api_call_log_server();
export const loginRoborockWithPassword = createServerFn({ method: "POST" }).handler(
  withApiLog("roborock", "loginWithPassword", async () => loginWithPassword()),
);

export const getRoborockSnapshot = createServerFn({ method: "GET" }).handler(
  withApiLog("roborock", "getSnapshot", async () => fetchRoborockSnapshot()),
);

export const sendRoborockCode = createServerFn({ method: "POST" }).handler(
  withApiLog("roborock", "requestLoginCode", async () => requestLoginCode()),
);

export const submitRoborockCode = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string }) => ({ code: String(data?.code ?? "").trim() }))
  .handler(
    withApiLog("roborock", "verifyLoginCode", async ({ data }: { data: { code: string } }) => {
      return await verifyLoginCode(data.code);
    }),
  );

export const sendRoborockCommand = createServerFn({ method: "POST" })
  .inputValidator((data: { duid: string; method: string; params?: any[] }) => ({
    duid: String(data?.duid ?? "").trim(),
    method: String(data?.method ?? "").trim(),
    params: Array.isArray(data?.params) ? data.params : [],
  }))
  .handler(
    withApiLog(
      "roborock",
      "sendDeviceCommand",
      async ({ data }: { data: { duid: string; method: string; params: any[] } }) => {
        if (!data.duid || !data.method) {
          return { ok: false, error: "Mangler duid eller method" };
        }
        return await sendDeviceCommand(data);
      },
    ),
  );
