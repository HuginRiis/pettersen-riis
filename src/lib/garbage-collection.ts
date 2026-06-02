import { createServerFn } from "@tanstack/react-start";

export const getGarbageOverview = createServerFn({ method: "GET" }).handler(async () => {
  const mod = await import("@/server/garbage-collection.server");
  return mod.getGarbageOverview();
});

export const setGarbageAddress = createServerFn({ method: "POST" })
  .inputValidator((input: {
    address_text: string;
    kommunenr: string;
    gatenavn: string;
    gatekode: string;
    husnr: string;
    label?: string;
  }) => {
    const trim = (s: unknown) => String(s ?? "").trim();
    const address_text = trim(input.address_text);
    const kommunenr = trim(input.kommunenr);
    const gatenavn = trim(input.gatenavn);
    const gatekode = trim(input.gatekode);
    const husnr = trim(input.husnr);
    if (!address_text || !kommunenr || !gatenavn || !gatekode || !husnr) {
      throw new Error("Alle adressefelt må fylles ut.");
    }
    if (!/^\d{3,4}$/.test(kommunenr)) throw new Error("Kommunenr må være 3–4 sifre.");
    if (!/^\d{1,8}$/.test(gatekode)) throw new Error("Gatekode må være tall.");
    return {
      address_text: address_text.slice(0, 200),
      kommunenr,
      gatenavn: gatenavn.slice(0, 120),
      gatekode,
      husnr: husnr.slice(0, 12),
      label: trim(input.label).slice(0, 40) || "Borgen",
    };
  })
  .handler(async ({ data }) => {
    const mod = await import("@/server/garbage-collection.server");
    return mod.setGarbageAddress(data);
  });

export const updateGarbagePref = createServerFn({ method: "POST" })
  .inputValidator((input: {
    fraksjon_id: number;
    fraksjon_navn?: string;
    enabled?: boolean;
    days_before?: number;
    notify_hour?: number;
    notify_minute?: number;
    who?: string;
  }) => {
    if (typeof input?.fraksjon_id !== "number") throw new Error("Mangler fraksjon_id");
    return {
      fraksjon_id: input.fraksjon_id,
      fraksjon_navn: typeof input.fraksjon_navn === "string" ? input.fraksjon_navn.slice(0, 80) : undefined,
      enabled: typeof input.enabled === "boolean" ? input.enabled : undefined,
      days_before: typeof input.days_before === "number" ? input.days_before : undefined,
      notify_hour: typeof input.notify_hour === "number" ? input.notify_hour : undefined,
      notify_minute: typeof input.notify_minute === "number" ? input.notify_minute : undefined,
      who: typeof input.who === "string" ? input.who.slice(0, 40) : undefined,
    };
  })
  .handler(async ({ data }) => {
    const mod = await import("@/server/garbage-collection.server");
    return mod.updateGarbagePref(data);
  });

// For agenda-push hooken
export async function processGarbageNotifications() {
  const mod = await import("@/server/garbage-collection.server");
  return mod.processGarbageNotifications();
}
