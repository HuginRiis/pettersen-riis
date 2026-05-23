import { createFileRoute } from "@tanstack/react-router";
import { getStravaCredentials, isStravaOwner, type StravaOwner } from "@/server/strava-connection";

const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";

export const Route = createFileRoute("/api/strava/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const ownerParam = url.searchParams.get("owner");
        const owner: StravaOwner = isStravaOwner(ownerParam) ? ownerParam : "arne";
        const { clientId } = getStravaCredentials(owner);
        if (!clientId) {
          return new Response(`STRAVA_CLIENT_ID mangler for ${owner}`, { status: 500 });
        }


        const url = new URL(request.url);
        const ownerParam = url.searchParams.get("owner");
        const owner: StravaOwner = isStravaOwner(ownerParam) ? ownerParam : "arne";
        const redirectUri = `${url.origin}/api/strava/callback`;

        // Pakk owner inn i state slik at callback vet hvilken konto vi binder til.
        const nonce = crypto.randomUUID();
        const state = `${owner}.${nonce}`;
        const authUrl = new URL(STRAVA_AUTH_URL);
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("response_type", "code");
        // 'force' sikrer at bruker kan logge inn med en annen Strava-konto
        // selv om nettleseren allerede har en aktiv Strava-sesjon.
        authUrl.searchParams.set("approval_prompt", "force");
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
