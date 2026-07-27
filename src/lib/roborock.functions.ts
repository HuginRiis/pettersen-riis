import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
const __load_roborock_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/roborock.server")> => import("@/lib/roborock.server"))
  .client((): Promise<typeof import("@/lib/roborock.server")> => Promise.resolve({} as unknown as typeof import("@/lib/roborock.server")));
const { fetchRoborockSnapshot, requestLoginCode, verifyLoginCode, loginWithPassword, sendDeviceCommand } = await __load_roborock_server();
const __load_api_call_log_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/api-call-log.server")> => import("@/lib/api-call-log.server"))
  .client((): Promise<typeof import("@/lib/api-call-log.server")> => Promise.resolve({} as unknown as typeof import("@/lib/api-call-log.server")));
const { withApiLog } = await __load_api_call_log_server();
const __load_auth = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/house-auth.server")> => import("@/lib/house-auth.server"))
  .client((): Promise<typeof import("@/lib/house-auth.server")> => Promise.resolve({ requireHouseAuth: async () => {}, isHouseAuthenticated: async () => false } as unknown as typeof import("@/lib/house-auth.server")));
const { requireHouseAuth } = await __load_auth();

export const loginRoborockWithPassword = createServerFn({ method: "POST" }).handler(
  withApiLog("roborock", "loginWithPassword", async () => {
    await requireHouseAuth();
    return loginWithPassword();
  }),
);

export const getRoborockSnapshot = createServerFn({ method: "GET" }).handler(
  withApiLog("roborock", "getSnapshot", async () => fetchRoborockSnapshot()),
);

export const sendRoborockCode = createServerFn({ method: "POST" }).handler(
  withApiLog("roborock", "requestLoginCode", async () => {
    await requireHouseAuth();
    return requestLoginCode();
  }),
);

export const submitRoborockCode = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string }) => ({ code: String(data?.code ?? "").trim() }))
  .handler(
    withApiLog("roborock", "verifyLoginCode", async ({ data }: { data: { code: string } }) => {
      await requireHouseAuth();
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
        await requireHouseAuth();
        if (!data.duid || !data.method) {
          return { ok: false, error: "Mangler duid eller method" };
        }
        return await sendDeviceCommand(data);
      },
    ),
  );
