import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
const __load_gardena_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/gardena.server")> => import("@/lib/gardena.server"))
  .client((): Promise<typeof import("@/lib/gardena.server")> => Promise.resolve({} as unknown as typeof import("@/lib/gardena.server")));
const { fetchGardenaSnapshot, sendMowerCommand } = await __load_gardena_server();

const __load_store = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/gardena-snapshot-store.server")> => import("@/lib/gardena-snapshot-store.server"))
  .client((): Promise<typeof import("@/lib/gardena-snapshot-store.server")> => Promise.resolve({} as unknown as typeof import("@/lib/gardena-snapshot-store.server")));
const { loadStoredGardenaSnapshot, saveGardenaSnapshot } = await __load_store();

const __load_auth = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/house-auth.server")> => import("@/lib/house-auth.server"))
  .client((): Promise<typeof import("@/lib/house-auth.server")> => Promise.resolve({ requireHouseAuth: async () => {}, isHouseAuthenticated: async () => false } as unknown as typeof import("@/lib/house-auth.server")));
const { requireHouseAuth } = await __load_auth();

export const getGardenaSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const snap = await fetchGardenaSnapshot();
  // Lagre i delt server-cache slik at andre lesere slipper å treffe API-et.
  await saveGardenaSnapshot(snap);
  return snap;
});

/**
 * Leser KUN fra delt server-cache (public.gardena_snapshot) som mates av
 * gardena-poll-cron. Treffer aldri Husqvarna/Gardena-API-et. Brukes av
 * smart-dashbord og andre lesere som ikke skal trigge nye API-kall.
 */
export const getCachedGardenaSnapshotFn = createServerFn({ method: "GET" }).handler(async () => {
  const cached = await loadStoredGardenaSnapshot();
  if (!cached) return null;
  return { snap: cached.snap, updatedAt: cached.updatedAt };
});

export const controlGardenaMower = createServerFn({ method: "POST" })
  .inputValidator((data: { serviceId: string; command: string; seconds?: number }) => ({
    serviceId: String(data?.serviceId ?? "").trim(),
    command: String(data?.command ?? "").trim(),
    seconds: typeof data?.seconds === "number" ? data.seconds : undefined,
  }))
  .handler(async ({ data }) => {
    await requireHouseAuth();
    if (!data.serviceId || !data.command) {
      return { ok: false, error: "Mangler serviceId eller command" };
    }
    return await sendMowerCommand(data.serviceId, data.command, data.seconds);
  });
