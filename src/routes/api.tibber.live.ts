import { createFileRoute } from "@tanstack/react-router";

/**
 * Tibber sanntid via Server-Sent Events.
 *
 * Tibber Pulse leverer "watt akkurat nå" gjennom en GraphQL-subscription
 * over websocket (graphql-transport-ws). Denne routen:
 *   1. Slår opp websocket-URL og home-id basert på `?location=hytta|tollnes`.
 *   2. Åpner en WS mot Tibber, abonnerer på `liveMeasurement(homeId: ...)`.
 *   3. Pusher hver oppdatering til klienten som SSE.
 *
 * Klienten kobler seg på med `new EventSource("/api/tibber/live?location=hytta")`.
 */

const TIBBER_GQL = "https://api.tibber.com/v1-beta/gql";

type HomeInfo = {
  id: string;
  appNickname: string | null;
  address1: string | null;
};

function classify(h: HomeInfo): "hytta" | "tollnes" | null {
  const hay = `${h.appNickname ?? ""} ${h.address1 ?? ""}`.toLowerCase();
  if (
    hay.includes("bjørkeset") ||
    hay.includes("bjorkeset") ||
    hay.includes("hytt") ||
    hay.trim() === "hytta"
  ) {
    return "hytta";
  }
  if (
    hay.includes("tollnes") ||
    hay.includes("lensmannsveg") ||
    hay.includes("lensmannsvei") ||
    hay.includes("lensmann")
  ) {
    return "tollnes";
  }
  return null;
}

async function tibberMeta(token: string) {
  const res = await fetch(TIBBER_GQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `{
        viewer {
          websocketSubscriptionUrl
          homes {
            id
            appNickname
            address { address1 }
            features { realTimeConsumptionEnabled }
          }
        }
      }`,
    }),
  });
  if (!res.ok) throw new Error(`Tibber meta ${res.status}`);
  const json = (await res.json()) as any;
  const wsUrl: string | undefined = json?.data?.viewer?.websocketSubscriptionUrl;
  const homes: HomeInfo[] = (json?.data?.viewer?.homes ?? []).map((h: any) => ({
    id: h.id,
    appNickname: h.appNickname,
    address1: h.address?.address1 ?? null,
    realtime: !!h.features?.realTimeConsumptionEnabled,
  }));
  return { wsUrl, homes };
}

export const Route = createFileRoute("/api/tibber/live")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const location = url.searchParams.get("location");
        if (location !== "hytta" && location !== "tollnes") {
          return new Response("Bad location", { status: 400 });
        }
        const token = process.env.TIBBER_TOKEN;
        if (!token) {
          return new Response("TIBBER_TOKEN mangler", { status: 500 });
        }

        let wsUrl: string | undefined;
        let homeId: string | undefined;
        try {
          const meta = await tibberMeta(token);
          wsUrl = meta.wsUrl;
          const home = meta.homes.find((h) => classify(h) === location);
          homeId = home?.id;
        } catch (e: any) {
          return new Response(`Tibber meta feil: ${e?.message ?? e}`, { status: 502 });
        }
        if (!wsUrl || !homeId) {
          return new Response("Fant ikke hjem hos Tibber", { status: 404 });
        }

        const encoder = new TextEncoder();
        let socket: WebSocket | null = null;
        let heartbeat: ReturnType<typeof setInterval> | null = null;
        let closed = false;

        const stream = new ReadableStream({
          async start(controller) {
            const send = (event: string, data: unknown) => {
              if (closed) return;
              try {
                controller.enqueue(
                  encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
                );
              } catch {
                /* ignore */
              }
            };

            const cleanup = () => {
              if (closed) return;
              closed = true;
              if (heartbeat) clearInterval(heartbeat);
              try {
                socket?.close();
              } catch {
                /* ignore */
              }
              try {
                controller.close();
              } catch {
                /* ignore */
              }
            };

            send("ready", { homeId });

            // Cloudflare Workers støtter ikke `new WebSocket(url)` for utgående
            // tilkoblinger — vi må bruke fetch() med Upgrade-header og lese
            // `webSocket` fra responsen. Dette mønsteret fungerer både i
            // Workers og i lokal Node-bun dev (via undici/ws-shim).
            try {
              const upgradeRes = await fetch(wsUrl!, {
                headers: {
                  Upgrade: "websocket",
                  "Sec-WebSocket-Protocol": "graphql-transport-ws",
                },
              });
              const ws = (upgradeRes as unknown as { webSocket?: WebSocket }).webSocket;
              if (!ws) {
                send("error", {
                  message: `WS-upgrade feilet (status ${upgradeRes.status})`,
                });
                cleanup();
                return;
              }
              // Cloudflare krever .accept() før send/receive.
              (ws as unknown as { accept?: () => void }).accept?.();
              socket = ws;
            } catch (e: any) {
              send("error", { message: `WS feilet: ${e?.message ?? e}` });
              cleanup();
              return;
            }

            // Init etter accept.
            try {
              socket.send(
                JSON.stringify({
                  type: "connection_init",
                  payload: { token },
                }),
              );
            } catch (e: any) {
              send("error", { message: `WS init feilet: ${e?.message ?? e}` });
              cleanup();
              return;
            }

            socket.addEventListener("message", (ev: MessageEvent) => {
              let msg: any;
              try {
                msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
              } catch {
                return;
              }
              if (msg?.type === "connection_ack") {
                socket?.send(
                  JSON.stringify({
                    id: "1",
                    type: "subscribe",
                    payload: {
                      query: `subscription Live($homeId: ID!) {
                        liveMeasurement(homeId: $homeId) {
                          timestamp
                          power
                          accumulatedConsumption
                          accumulatedCost
                          currency
                          minPower
                          maxPower
                          averagePower
                        }
                      }`,
                      variables: { homeId },
                    },
                  }),
                );
                return;
              }
              if (msg?.type === "next" && msg?.payload?.data?.liveMeasurement) {
                send("measurement", msg.payload.data.liveMeasurement);
                return;
              }
              if (msg?.type === "error") {
                send("error", { message: JSON.stringify(msg.payload).slice(0, 300) });
                return;
              }
              if (msg?.type === "complete") {
                send("error", { message: "Tibber avsluttet subscription" });
                cleanup();
              }
            });

            socket.addEventListener("error", () => {
              send("error", { message: "WS-feil mot Tibber" });
            });

            socket.addEventListener("close", () => {
              cleanup();
            });

            heartbeat = setInterval(() => {
              if (closed) return;
              try {
                controller.enqueue(encoder.encode(`: ping\n\n`));
              } catch {
                /* ignore */
              }
            }, 25_000);

            request.signal.addEventListener("abort", cleanup);
          },
          cancel() {
            closed = true;
            if (heartbeat) clearInterval(heartbeat);
            try {
              socket?.close();
            } catch {
              /* ignore */
            }
          },
        });

        return new Response(stream, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
