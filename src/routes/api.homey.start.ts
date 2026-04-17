import { createFileRoute } from "@tanstack/react-router";
import { HOMEY_SCOPES } from "@/server/homey";

const ATHOM_AUTH_BASE = "https://api.athom.com";

export const Route = createFileRoute("/api/homey/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clientId = process.env.HOMEY_CLIENT_ID;
        if (!clientId) {
          return new Response("HOMEY_CLIENT_ID mangler", { status: 500 });
        }
        const redirectUri = "https://pettersen-riis.lovable.app/api/homey/callback";

        const state = crypto.randomUUID();
        const authUrl = new URL(`${ATHOM_AUTH_BASE}/oauth2/authorise`);
        authUrl.searchParams.set("authorization_type", "code");
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("scope", HOMEY_SCOPES.join(" "));
        authUrl.searchParams.set("state", state);

        return new Response(null, {
          status: 302,
          headers: {
            Location: authUrl.toString(),
            "Set-Cookie": `homey_oauth_state=${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
          },
        });
      },
    },
  },
});
