import { createServerFn } from "@tanstack/react-start";
import { fetchGardenaSnapshot } from "@/server/gardena.server";

export const getGardenaSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  return await fetchGardenaSnapshot();
});
