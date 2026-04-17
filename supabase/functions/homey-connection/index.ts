type StoredHomeyConnection = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope?: string | null;
  athom_user_id?: string | null;
  athom_user_name?: string | null;
};

const INTERNAL_TOKEN_SALT = "house-riis-homey-backend-v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function getConfig() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const housePassword = Deno.env.get("HOUSE_RIIS_PASSWORD");

  if (!url || !serviceRoleKey || !housePassword) {
    throw new Error("Missing backend configuration for Homey connection function.");
  }

  return { url, serviceRoleKey, housePassword };
}

async function createInternalToken(secret: string) {
  const input = new TextEncoder().encode(`${secret}:${INTERNAL_TOKEN_SALT}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  const maxLength = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }

  return diff === 0;
}

async function authorizeRequest(request: Request, housePassword: string) {
  const provided = request.headers.get("x-house-riis-token") ?? "";
  const expected = await createInternalToken(housePassword);
  return timingSafeEqual(provided, expected);
}

function adminHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

async function readErrorMessage(response: Response) {
  const text = await response.text();
  if (!text) return `Homey database request failed (${response.status}).`;

  try {
    const payload = JSON.parse(text) as { error?: string; message?: string } | Array<{ message?: string }>;
    if (Array.isArray(payload)) {
      return payload[0]?.message ?? `Homey database request failed (${response.status}).`;
    }
    return payload.message ?? payload.error ?? text;
  } catch {
    return text;
  }
}

function isNonEmptyString(value: unknown, maxLength = 4000): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

Deno.serve(async (request) => {
  try {
    const { url, serviceRoleKey, housePassword } = getConfig();

    if (!(await authorizeRequest(request, housePassword))) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (request.method === "GET") {
      const response = await fetch(
        `${url}/rest/v1/homey_connections?provider=eq.athom&select=access_token,refresh_token,expires_at,scope,athom_user_id,athom_user_name&limit=1`,
        {
          headers: adminHeaders(serviceRoleKey),
        },
      );

      if (!response.ok) {
        return json({ error: await readErrorMessage(response) }, response.status);
      }

      const rows = (await response.json()) as StoredHomeyConnection[];
      return json(rows[0] ?? null);
    }

    if (request.method === "POST") {
      const payload = (await request.json()) as Partial<StoredHomeyConnection>;

      if (
        !isNonEmptyString(payload.access_token) ||
        !isNonEmptyString(payload.refresh_token) ||
        !isNonEmptyString(payload.expires_at, 200)
      ) {
        return json({ error: "Invalid Homey connection payload." }, 400);
      }

      const row = {
        provider: "athom",
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        expires_at: payload.expires_at,
        scope: typeof payload.scope === "string" ? payload.scope : null,
        athom_user_id: typeof payload.athom_user_id === "string" ? payload.athom_user_id : null,
        athom_user_name: typeof payload.athom_user_name === "string" ? payload.athom_user_name : null,
      };

      const response = await fetch(
        `${url}/rest/v1/homey_connections?on_conflict=provider&select=access_token,refresh_token,expires_at,scope,athom_user_id,athom_user_name`,
        {
          method: "POST",
          headers: {
            ...adminHeaders(serviceRoleKey),
            Prefer: "resolution=merge-duplicates, return=representation",
          },
          body: JSON.stringify([row]),
        },
      );

      if (!response.ok) {
        return json({ error: await readErrorMessage(response) }, response.status);
      }

      const rows = (await response.json()) as StoredHomeyConnection[];
      return json(rows[0] ?? null);
    }

    if (request.method === "DELETE") {
      const response = await fetch(`${url}/rest/v1/homey_connections?provider=eq.athom`, {
        method: "DELETE",
        headers: adminHeaders(serviceRoleKey),
      });

      if (!response.ok) {
        return json({ error: await readErrorMessage(response) }, response.status);
      }

      return json({ ok: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Unknown Homey backend error" },
      500,
    );
  }
});