export type StoredHomeyConnection = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope?: string | null;
  athom_user_id?: string | null;
  athom_user_name: string | null;
};

type SaveHomeyConnectionInput = StoredHomeyConnection;

const HOMEY_CONNECTION_FUNCTION_PATH = "/functions/v1/homey-connection";
const INTERNAL_TOKEN_SALT = "house-riis-homey-backend-v1";

function getHomeyBackendConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const housePassword = process.env.HOUSE_RIIS_PASSWORD;

  if (!url || !publishableKey || !housePassword) {
    throw new Error("Homey-backend mangler nødvendig serverkonfigurasjon.");
  }

  return {
    functionUrl: `${url}${HOMEY_CONNECTION_FUNCTION_PATH}`,
    publishableKey,
    housePassword,
  };
}

async function createInternalToken(secret: string) {
  const input = new TextEncoder().encode(`${secret}:${INTERNAL_TOKEN_SALT}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function parseJsonSafely(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function callHomeyConnectionFunction<T>(method: "GET" | "POST" | "DELETE", body?: unknown) {
  const { functionUrl, publishableKey, housePassword } = getHomeyBackendConfig();
  const internalToken = await createInternalToken(housePassword);

  const response = await fetch(functionUrl, {
    method,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      "x-house-riis-token": internalToken,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const raw = await response.text();
  const payload = raw ? parseJsonSafely(raw) : null;

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Homey-lagring feilet (${response.status})`;

    throw new Error(message);
  }

  return payload as T;
}

export async function loadHomeyConnection() {
  return callHomeyConnectionFunction<StoredHomeyConnection | null>("GET");
}

export async function saveHomeyConnection(input: SaveHomeyConnectionInput) {
  return callHomeyConnectionFunction<StoredHomeyConnection>("POST", input);
}

export async function deleteHomeyConnection() {
  return callHomeyConnectionFunction<{ ok: true }>("DELETE");
}