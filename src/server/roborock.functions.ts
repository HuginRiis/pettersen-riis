import { createServerFn } from "@tanstack/react-start";
import { fetchRoborockSnapshot, requestLoginCode, verifyLoginCode } from "@/server/roborock.server";

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
