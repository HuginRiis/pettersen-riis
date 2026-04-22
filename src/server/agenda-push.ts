import { createServerFn } from "@tanstack/react-start";

export async function processAgendaNotifications() {
  const mod = await import("./agenda-push.server");
  return mod.processAgendaNotifications();
}

export const getPushPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  const mod = await import("./agenda-push.server");
  return { vapidPublicKey: mod.getVapidPublicKey() };
});

export const sendAgendaTestPush = createServerFn({ method: "POST" })
  .inputValidator((input: { endpoint: string; who: string }) => {
    if (typeof input?.endpoint !== "string" || input.endpoint.length < 10 || input.endpoint.length > 2000) {
      throw new Error("Ugyldig abonnement for test-push.");
    }
    if (typeof input?.who !== "string" || input.who.length < 1 || input.who.length > 40) {
      throw new Error("Ugyldig mottaker for test-push.");
    }
    return { endpoint: input.endpoint, who: input.who };
  })
  .handler(async ({ data }) => {
    const mod = await import("./agenda-push.server");
    return mod.sendAgendaTestPushByEndpoint(data);
  });