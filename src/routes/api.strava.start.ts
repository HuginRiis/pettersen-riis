import { createFileRoute } from "@tanstack/react-router";
import {
  createStravaState,
  getStravaCredentials,
  isStravaOwner,
  type StravaOwner,
} from "@/serve./strava-connection.server.server";

const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";
const REBEKKA_STRAVA_ORIGIN = "https://arne.riis.cc";

export const Route = createFileRoute("/api/strava/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const ownerParam = url.searchParams.get("owner");
        const owner: StravaOwner = isStravaOwner(ownerParam) ? ownerParam : "arne";

        // Rebekka sin Strava-app tillater bare ett callback-domene.
        // Hvis tilkoblingen startes fra preview/lovable-domenet, flytt starten
        // til custom domain først slik at redirect_uri matcher Strava-oppsettet.
        if (owner === "rebekka" && url.origin !== REBEKKA_STRAVA_ORIGIN) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: `${REBEKKA_STRAVA_ORIGIN}/api/strava/start?owner=rebekka`,
            },
          });
        }

        const { clientId } = getStravaCredentials(owner);
        if (!clientId) {
          return new Response(`STRAVA_CLIENT_ID mangler for ${owner}`, { status: 500 });
        }
        if (!/^\d+$/.test(clientId)) {
          return new Response(
            `STRAVA_CLIENT_ID${owner === "rebekka" ? "_REBEKKA" : ""} må være den numeriske Client ID-en fra Strava, ikke Client Secret.`,
            { status: 500 },
          );
        }
        const callbackOrigin = owner === "rebekka" ? REBEKKA_STRAVA_ORIGIN : url.origin;
        const redirectUri = `${callbackOrigin}/api/strava/callback`;

        // Pakk owner inn i state slik at callback vet hvilken konto vi binder til.
        const stateSecret = process.env.STRAVA_OAUTH_STATE_SECRET;
        const state = stateSecret
          ? createStravaState(owner, stateSecret)
          : `${owner}.${Date.now()}.${crypto.randomUUID()}`;
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
