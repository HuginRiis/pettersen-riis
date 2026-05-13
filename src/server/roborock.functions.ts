import { createServerFn } from "@tanstack/react-start";
import {
  fetchRoborockSnapshot,
  requestLoginCode,
  verifyLoginCode,
  loginWithPassword,
  sendDeviceCommand,
} from "@/server/roborock.server";
import { withApiLog } from "@/server/api-call-log.server";

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
