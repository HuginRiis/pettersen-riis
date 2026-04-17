import { createFileRoute } from "@tanstack/react-router";
import { saveHomeyConnection } from "@/server/homey-connection";

const ATHOM_AUTH_BASE = "https://accounts.athom.com";
const ATHOM_API_BASE = "https://api.athom.com";

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function errorPage(message: string, status = 400) {
  return htmlResponse(
    `<!doctype html><html lang="nb"><head><meta charset="utf-8"><title>Homey-tilkobling feilet</title><style>body{font-family:system-ui;background:#0f0f10;color:#e7e2d3;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}.card{max-width:520px;background:#17171a;border:1px solid #2a2a2e;border-radius:12px;padding:32px;text-align:center}h1{color:#c9a74a;letter-spacing:.2em}a{color:#c9a74a}</style></head><body><div class="card"><h1>RAVNEN BLE BORTE</h1><p>${message.replace(/</g, "&lt;")}</p><p><a href="/smarthus">Tilbake til Maesterens Tårn</a></p></div></body></html>`,
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

export const Route = createFileRoute("/api/homey/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clientId = process.env.HOMEY_CLIENT_ID;
        const clientSecret = process.env.HOMEY_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          return errorPage("Server mangler HOMEY_CLIENT_ID/SECRET", 500);
        }

        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const oauthError = url.searchParams.get("error");
        if (oauthError) return errorPage(`Athom svarte: ${oauthError}`);
        if (!code) return errorPage("Mangler 'code' fra Athom");

        const cookieState = readCookie(request.headers.get("cookie"), "homey_oauth_state");
        if (!cookieState || cookieState !== state) {
          return errorPage("Ugyldig state — start tilkoblingen på nytt.", 400);
        }

        const redirectUri = `${url.origin}/api/homey/callback`;

        // Exchange code for tokens
        const tokenRes = await fetch(`${ATHOM_AUTH_BASE}/oauth2/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
          }),
        });

        if (!tokenRes.ok) {
          const text = await tokenRes.text();
          return errorPage(`Token-bytte feilet (${tokenRes.status}): ${text.slice(0, 200)}`);
        }

        const tok = (await tokenRes.json()) as {
          access_token: string;
          refresh_token: string;
          expires_in: number;
          scope?: string;
        };

        // Fetch user info to label the connection
        let athomUserId: string | null = null;
        let athomUserName: string | null = null;
        try {
          const meRes = await fetch(`${ATHOM_API_BASE}/user/me`, {
            headers: { Authorization: `Bearer ${tok.access_token}`, Accept: "application/json" },
          });
          if (meRes.ok) {
            const me = (await meRes.json()) as any;
            athomUserId = me?.id ?? me?.user?.id ?? null;
            athomUserName = me?.name ?? me?.user?.name ?? null;
          }
        } catch {
          // non-fatal
        }

        const expiresAt = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString();

        try {
          await saveHomeyConnection({
            access_token: tok.access_token,
            refresh_token: tok.refresh_token,
            expires_at: expiresAt,
            scope: tok.scope ?? null,
            athom_user_id: athomUserId,
            athom_user_name: athomUserName,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Ukjent feil";
          return errorPage(`Kunne ikke lagre tilkobling: ${message}`, 500);
        }

        return new Response(null, {
          status: 302,
          headers: {
            Location: "/smarthus?connected=1",
            "Set-Cookie": "homey_oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
          },
        });
      },
    },
  },
});
