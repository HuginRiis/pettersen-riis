import { createServerFn } from "@tanstack/react-start";
const __load_gardena_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/server/gardena.server")> => import("@/server/gardena.server"))
  .client((): Promise<typeof import("@/server/gardena.server")> => Promise.resolve({} as unknown as typeof import("@/server/gardena.server")));
const { fetchGardenaSnapshot, sendMowerCommand } = await __load_gardena_server();
export const getGardenaSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  return await fetchGardenaSnapshot();
});

export const controlGardenaMower = createServerFn({ method: "POST" })
  .inputValidator((data: { serviceId: string; command: string; seconds?: number }) => ({
    serviceId: String(data?.serviceId ?? "").trim(),
    command: String(data?.command ?? "").trim(),
    seconds: typeof data?.seconds === "number" ? data.seconds : undefined,
  }))
  .handler(async ({ data }) => {
    if (!data.serviceId || !data.command) {
      return { ok: false, error: "Mangler serviceId eller command" };
    }
    return await sendMowerCommand(data.serviceId, data.command, data.seconds);
  });
