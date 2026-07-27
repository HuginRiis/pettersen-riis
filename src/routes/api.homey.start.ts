import { createFileRoute } from "@tanstack/react-router";
import { HOMEY_SCOPES } from "@/lib/homey.functions";

const ATHOM_AUTH_BASE = "https://api.athom.com";
const REDIRECT_URI = "https://pettersen-riis.lovable.app/api/homey/callback";

export const Route = createFileRoute("/api/homey/start")({
  server: {
    handlers: {
      GET: async () => {
        const { isHouseAuthenticated } = await import("@/lib/house-auth.server");
        if (!(await isHouseAuthenticated())) {
          return new Response("Du må logge inn på huset først.", { status: 401 });
        }
        const clientId = process.env.HOMEY_CLIENT_ID;
        if (!clientId) {
          return new Response("HOMEY_CLIENT_ID mangler", { status: 500 });
        }

        const state = crypto.randomUUID();
        const authUrl = new URL(`${ATHOM_AUTH_BASE}/oauth2/authorise`);
        // Athom bruker `authorization_type` (ikke `response_type`) per dokumentasjonen.
        // Scopes bestemmes av OAuth2-klienten i Homey Developer Tools, ikke i URLen.
        authUrl.searchParams.set("authorization_type", "code");
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
        authUrl.searchParams.set("state", state);
        // Fjern referanse til ubrukte scopes
        void HOMEY_SCOPES;

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
