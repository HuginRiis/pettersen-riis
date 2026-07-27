/**
 * Klient-side hjelper for Web Push abonnement.
 * Bruker localStorage for å huske valgt person på enheten.
 */
import { supabase } from "@/integrations/supabase/client";

// Public VAPID key — trygg å committe (kun privat nøkkel skal være hemmelig).
const VAPID_PUBLIC_KEY =
  "BPSODBOF2DyMKZWvltonHi0Bh3-3de70h6CxTYvZb71-wYTmUdoMZJ_xU2AZI9LjyA3hUaP_gyFUR-m7mnvTj0E";
const WHO_KEY = "agenda_push_who";

export type Who =
  | "Alle"
  | "Arne & Rebekka"
  | "Arne"
  | "Rebekka"
  | "Marita"
  | "Nora"
  | "Celine"
  | "Mira";

export function getStoredWho(): Who {
  if (typeof window === "undefined") return "Alle";
  return ((localStorage.getItem(WHO_KEY) as Who) || "Alle");
}

export function setStoredWho(w: Who) {
  if (typeof window === "undefined") return;
  localStorage.setItem(WHO_KEY, w);
}

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) out[i] = rawData.charCodeAt(i);
  return out;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/sw.js");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js");
}

export async function getSubscriptionStatus(): Promise<"granted" | "denied" | "default" | "unsupported"> {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

export async function isCurrentlySubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

export async function getCurrentSubscriptionDetails(): Promise<{ endpoint: string; who: Who } | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!reg) return null;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return null;
    return {
      endpoint: sub.endpoint,
      who: getStoredWho(),
    };
  } catch {
    return null;
  }
}

export async function subscribePush(
  who: Who,
  vapidPublicKey = VAPID_PUBLIC_KEY,
): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: "Enheten støtter ikke push-varsler." };
  if (!vapidPublicKey) return { ok: false, error: "VAPID public key mangler i miljøvariabler." };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, error: "Du må tillate varsler i nettleseren." };

  const reg = await getRegistration();
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const json = sub.toJSON();
  const endpoint = json.endpoint!;
  const p256dh = json.keys?.p256dh!;
  const auth = json.keys?.auth!;

  // Upsert via server-funksjon (krever husets sesjon).
  const { upsertPushSubscription } = await import("@/lib/push-write.functions");
  const res = await upsertPushSubscription({
    data: {
      endpoint,
      p256dh,
      auth,
      who,
      user_agent: navigator.userAgent,
    },
  });
  if (!res.ok) return { ok: false, error: res.error };
  setStoredWho(who);
  return { ok: true };

}

export async function unsubscribePush(): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: "Enheten støtter ikke push-varsler." };
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!reg) return { ok: true };
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return { ok: true };
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    const { deletePushSubscription } = await import("@/lib/push-write.functions");
    await deletePushSubscription({ data: { endpoint } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function updateSubscriptionWho(who: Who): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: "Enheten støtter ikke push-varsler." };
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!reg) return { ok: false, error: "Ingen service worker" };
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return { ok: false, error: "Ikke abonnert" };
    const { updatePushSubscriptionWho } = await import("@/lib/push-write.functions");
    const res = await updatePushSubscriptionWho({ data: { endpoint: sub.endpoint, who } });
    if (!res.ok) return { ok: false, error: res.error };
    setStoredWho(who);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

