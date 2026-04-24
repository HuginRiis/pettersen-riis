import { createFileRoute } from "@tanstack/react-router";
import {
  isStravaOwner,
  saveStravaConnection,
  type StravaOwner,
} from "@/server/strava-connection";

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function errorPage(message: string, status = 400) {
  return htmlResponse(
    `<!doctype html><html lang="nb"><head><meta charset="utf-8"><title>Strava-tilkobling feilet</title><style>body{font-family:system-ui;background:#0f0f10;color:#e7e2d3;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}.card{max-width:520px;background:#17171a;border:1px solid #2a2a2e;border-radius:12px;padding:32px;text-align:center}h1{color:#c9a74a;letter-spacing:.2em}a{color:#c9a74a}</style></head><body><div class="card"><h1>BUDET KOM IKKE FRAM</h1><p>${message.replace(/</g, "&lt;")}</p><p><a href="/trening">Tilbake til Treningssalen</a></p></div></body></html>`,
    status,
  );
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  const parts = header.split(/;\s*/);
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx === -1) continue;
    if (p.slice(0, idx) === name) return decodeURIComponent(p.slice(idx + 1));
  }
  return null;
}

export const Route = createFileRoute("/api/strava/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clientId = process.env.STRAVA_CLIENT_ID;
        const clientSecret = process.env.STRAVA_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          return errorPage("Server mangler STRAVA_CLIENT_ID/SECRET", 500);
        }

        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const oauthError = url.searchParams.get("error");
        const scope = url.searchParams.get("scope");
        if (oauthError) return errorPage(`Strava svarte: ${oauthError}`);
        if (!code) return errorPage("Mangler 'code' fra Strava");

        const cookieState = readCookie(request.headers.get("cookie"), "strava_oauth_state");
        if (!cookieState || cookieState !== state) {
          return errorPage("Ugyldig state — start tilkoblingen på nytt.", 400);
        }

        // State har formen "<owner>.<nonce>" — hent eieren ut
        const ownerPart = (state ?? "").split(".")[0];
        const owner: StravaOwner = isStravaOwner(ownerPart) ? ownerPart : "arne";

        const tokenRes = await fetch("https://www.strava.com/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            grant_type: "authorization_code",
          }),
        });

        if (!tokenRes.ok) {
          const text = await tokenRes.text();
          return errorPage(`Token-bytte feilet (${tokenRes.status}): ${text.slice(0, 200)}`);
        }

        const tok = (await tokenRes.json()) as {
          access_token: string;
          refresh_token: string;
          expires_at: number; // unix seconds
          athlete?: { id?: number; firstname?: string; lastname?: string };
        };

        const athleteId = tok.athlete?.id ?? null;
        const athleteName =
          [tok.athlete?.firstname, tok.athlete?.lastname].filter(Boolean).join(" ") || null;

        try {
          await saveStravaConnection(owner, {
            access_token: tok.access_token,
            refresh_token: tok.refresh_token,
            expires_at: new Date(tok.expires_at * 1000).toISOString(),
            scope: scope ?? null,
            athlete_id: athleteId,
            athlete_name: athleteName,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Ukjent feil";
          return errorPage(`Kunne ikke lagre tilkobling: ${message}`, 500);
        }

        return new Response(null, {
          status: 302,
          headers: {
            Location: "/trening?connected=1",
            "Set-Cookie":
              "strava_oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
          },
        });
      },
    },
  },
});
