"use client";

/**
 * Web Push on this device: permission, the browser subscription, and its registration on the
 * backend (/api/admin/push/*). The service worker (public/sw.js) shows the notifications.
 */
import { apiGet, apiPost } from "@/lib/api";
import { getRegistration } from "@/lib/pwa";

export interface PushConfig {
  /** VAPID keys are set on the server. */
  enabled: boolean;
  publicKey: string | null;
  /** Devices of this admin subscribed right now. */
  devices: number;
}

export interface PushTestResult {
  sent: number;
  removed: number;
  failed: number;
}

export const pushApi = {
  config: () => apiGet<PushConfig>("/api/admin/push/config"),
  subscribe: (sub: PushSubscriptionJSON) => apiPost<void>("/api/admin/push/subscribe", sub),
  unsubscribe: (endpoint: string) => apiPost<void>("/api/admin/push/unsubscribe", { endpoint }),
  test: (endpoint: string | null) => apiPost<PushTestResult>("/api/admin/push/test", { endpoint }),
};

/** Remembered so the subscription is silently renewed on the next launch if the browser drops it. */
const ENABLED_KEY = "admin-push-enabled";

export type PushPermission = NotificationPermission | "unsupported";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function pushPermission(): PushPermission {
  if (!pushSupported()) return "unsupported";
  return Notification.permission;
}

function wanted(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

function setWanted(on: boolean): void {
  try {
    if (on) localStorage.setItem(ENABLED_KEY, "1");
    else localStorage.removeItem(ENABLED_KEY);
  } catch {
    /* private mode */
  }
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(sub: PushSubscription, publicKey: string): boolean {
  const current = sub.options?.applicationServerKey;
  if (!current) return true; // browser does not expose it — trust the subscription
  const a = new Uint8Array(current);
  const b = keyBytes(publicKey);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await getRegistration();
  if (!reg) return null;
  try {
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

async function subscribeWith(reg: ServiceWorkerRegistration, publicKey: string): Promise<PushSubscription> {
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, publicKey)) {
    // The server's VAPID keys changed: the old subscription can no longer be used.
    await sub.unsubscribe().catch(() => undefined);
    sub = null;
  }
  return sub ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
}

/**
 * Turn notifications on for this device. Must run from a tap (iOS asks for permission only then).
 * Throws with a message for the user when something is in the way.
 */
export async function enablePush(publicKey: string): Promise<PushSubscription> {
  if (!pushSupported()) throw new Error("Этот браузер не поддерживает push-уведомления");
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") {
    throw new Error("Уведомления запрещены — разрешите их в настройках браузера или телефона");
  }
  const reg = await getRegistration();
  if (!reg) throw new Error("Сервис-воркер не запустился — обновите страницу");
  let sub: PushSubscription;
  try {
    sub = await subscribeWith(reg, publicKey);
  } catch (e) {
    // Browser-side failure (no push service in this browser profile, blocked by the OS…): the
    // raw DOMException text is English and cryptic.
    const detail = e instanceof Error && e.message ? ` (${e.message})` : "";
    throw new Error(`Браузер не смог подписаться на уведомления${detail}. Попробуйте ещё раз или перезапустите приложение`);
  }
  await pushApi.subscribe(sub.toJSON());
  setWanted(true);
  return sub;
}

export async function disablePush(): Promise<void> {
  setWanted(false);
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => undefined);
  await pushApi.unsubscribe(endpoint).catch(() => undefined);
}

/**
 * On launch: keep the server in sync with this device — re-send a live subscription (the server
 * may have dropped it) and renew one the browser lost or that belongs to old VAPID keys.
 */
export async function syncPush(): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  const reg = await getRegistration();
  if (!reg) return;
  const existing = await reg.pushManager.getSubscription().catch(() => null);
  if (!existing && !wanted()) return;
  const config = await pushApi.config().catch(() => null);
  if (!config?.enabled || !config.publicKey) return;
  try {
    const sub = await subscribeWith(reg, config.publicKey);
    await pushApi.subscribe(sub.toJSON());
    setWanted(true);
  } catch {
    /* next launch tries again */
  }
}

/** App-icon badge = the «Внимание» count (installed app; no-op where unsupported). */
export function setAppBadge(count: number): void {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0) void nav.setAppBadge?.(count)?.catch(() => undefined);
    else void nav.clearAppBadge?.()?.catch(() => undefined);
  } catch {
    /* unsupported */
  }
}

export function badgeSupported(): boolean {
  return typeof navigator !== "undefined" && "setAppBadge" in navigator;
}
