import { createServerFn } from "@tanstack/react-start";
import { requireHouseAuth } from "./house-auth.server";
import { readLinketurState, writeLinketurState } from "./linketur-state.server";

const KEYS = new Set(["cabins", "crew", "food"]);

function parseKey(value: unknown): string {
  const key = String(value ?? "");
  if (!KEYS.has(key)) throw new Error("Ugyldig nøkkel.");
  return key;
}

export const getLinketurState = createServerFn({ method: "GET" })
  .inputValidator((input: { key: string }) => ({ key: parseKey(input?.key) }))
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const value = await readLinketurState(data.key);
    return { json: value === null ? null : JSON.stringify(value) };
  });

export const setLinketurState = createServerFn({ method: "POST" })
  .inputValidator((input: { key: string; value: unknown }) => {
    const key = parseKey(input?.key);
    const value = input?.value ?? {};
    if (typeof value !== "object" || Array.isArray(value)) throw new Error("Ugyldige data.");
    const size = JSON.stringify(value).length;
    if (size > 12_000_000) throw new Error("For mye data — bruk mindre bilder.");
    return { key, value };
  })
  .handler(async ({ data }) => {
    await requireHouseAuth();
    await writeLinketurState(data.key, data.value);
    return { ok: true };
  });
