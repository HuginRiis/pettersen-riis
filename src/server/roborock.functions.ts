import { createServerFn } from "@tanstack/react-start";
import { fetchRoborockSnapshot } from "@/server/roborock.server";

export const getRoborockSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  return await fetchRoborockSnapshot();
});
