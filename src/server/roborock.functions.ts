import { createServerFn } from "@tanstack/react-start";
import {
  fetchRoborockSnapshot,
  requestLoginCode,
  verifyLoginCode,
  loginWithPassword,
  sendDeviceCommand,
} from "@/server/roborock.server";

export const loginRoborockWithPassword = createServerFn({ method: "POST" }).handler(async () => {
  return await loginWithPassword();
});

export const getRoborockSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  return await fetchRoborockSnapshot();
});

export const sendRoborockCode = createServerFn({ method: "POST" }).handler(async () => {
  return await requestLoginCode();
});

export const submitRoborockCode = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string }) => ({ code: String(data?.code ?? "").trim() }))
  .handler(async ({ data }) => {
    return await verifyLoginCode(data.code);
  });

export const sendRoborockCommand = createServerFn({ method: "POST" })
  .inputValidator((data: { duid: string; method: string; params?: any[] }) => ({
    duid: String(data?.duid ?? "").trim(),
    method: String(data?.method ?? "").trim(),
    params: Array.isArray(data?.params) ? data.params : [],
  }))
  .handler(async ({ data }) => {
    if (!data.duid || !data.method) {
      return { ok: false, error: "Mangler duid eller method" };
    }
    return await sendDeviceCommand(data);
  });
