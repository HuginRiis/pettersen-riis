import { createFileRoute } from "@tanstack/react-router";

const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";

export const Route = createFileRoute("/api/strava/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clientId = process.env.STRAVA_CLIENT_ID;
        if (!clientId) {
          return new Response("STRAVA_CLIENT_ID mangler", { status: 500 });
        }

        const url = new URL(request.url);
        const redirectUri = `${url.origin}/api/strava/callback`;

        const state = crypto.randomUUID();
        const authUrl = new URL(STRAVA_AUTH_URL);
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("approval_prompt", "auto");
        authUrl.searchParams.set(
          "scope",
          "read,activity:read_all,profile:read_all",
        );
        authUrl.searchParams.set("state", state);

        return new Response(null, {
          status: 302,
          headers: {
            Location: authUrl.toString(),
            "Set-Cookie": `strava_oauth_state=${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
          },
        });
      },
    },
  },
});
