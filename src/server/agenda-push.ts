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

export const sendHyttaChecklistPush = createServerFn({ method: "POST" })
  .inputValidator((input: { title: string; body: string; url?: string; who?: string }) => {
    const title = String(input?.title ?? "").trim();
    const body = String(input?.body ?? "").trim();
    if (title.length < 1 || title.length > 120) throw new Error("Ugyldig tittel.");
    if (body.length < 1 || body.length > 600) throw new Error("Ugyldig innhold.");
    const who = typeof input?.who === "string" && input.who.length > 0 && input.who.length <= 40
      ? input.who
      : "Alle";
    return {
      title,
      body,
      url: typeof input?.url === "string" ? input.url.slice(0, 200) : "/hytta",
      who,
    };
  })
  .handler(async ({ data }) => {
    const mod = await import("./agenda-push.server");
    return mod.sendHyttaChecklistPush(data);
  });
