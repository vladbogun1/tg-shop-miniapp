"use client";

/**
 * The admin as an installed app: service worker registration and updates, the install prompt
 * (Android/desktop Chrome) and the iOS «На экран Домой» hint, platform detection.
 *
 * State lives in a tiny module-level store (useSyncExternalStore) because the browser events that
 * feed it — `beforeinstallprompt`, a waiting worker — fire once, before any component may care.
 */
import { useSyncExternalStore } from "react";

/** Chrome's install prompt event (not in lib.dom). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface PwaState {
  /** A new worker is installed and waiting — offer «Обновить приложение». */
  updateReady: boolean;
  /** Chrome offered installation (Android / desktop); `promptInstall()` shows its dialog. */
  canInstall: boolean;
  /** Running as the installed app (home screen / app window). */
  standalone: boolean;
  /** Service worker controls this page. */
  controlled: boolean;
}

let state: PwaState = { updateReady: false, canInstall: false, standalone: false, controlled: false };
const listeners = new Set<() => void>();
let installEvent: BeforeInstallPromptEvent | null = null;
let registration: ServiceWorkerRegistration | null = null;
let started = false;

function set(patch: Partial<PwaState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

const SERVER_STATE: PwaState = state;

export function usePwa(): PwaState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}

// ---- platform -------------------------------------------------------------------------------

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone / iPad (iPadOS reports itself as a Mac with touch). */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Safari itself on iOS — the only browser there whose share sheet reliably has «На экран Домой». */
export function isIosSafari(): boolean {
  if (!isIos()) return false;
  const ua = navigator.userAgent;
  return /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|GSA\/|Telegram/.test(ua);
}

/** iOS major.minor, or null elsewhere (Web Push needs 16.4+ and the installed app). */
export function iosVersion(): number | null {
  if (!isIos()) return null;
  const m = navigator.userAgent.match(/OS (\d+)[_.](\d+)/);
  return m ? Number(m[1]) + Number(m[2]) / 100 : null;
}

// ---- service worker -------------------------------------------------------------------------

const SW_ENABLED = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_SW_DEV === "1";

function watchWaiting(reg: ServiceWorkerRegistration): void {
  // An update that was already waiting when the page opened.
  if (reg.waiting && navigator.serviceWorker.controller) set({ updateReady: true });
  reg.addEventListener("updatefound", () => {
    const worker = reg.installing;
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      // "installed" with a controller present = an update (the first install has no controller).
      if (worker.state === "installed" && navigator.serviceWorker.controller) set({ updateReady: true });
    });
  });
}

/** Called once from the client root. Safe to call more than once. */
export function startPwa(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  set({ standalone: isStandalone() });
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", () => set({ standalone: isStandalone() }));

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own button instead of Chrome's mini-infobar
    installEvent = e as BeforeInstallPromptEvent;
    set({ canInstall: true });
  });
  window.addEventListener("appinstalled", () => {
    installEvent = null;
    set({ canInstall: false });
  });

  if (!("serviceWorker" in navigator) || !SW_ENABLED) return;
  set({ controlled: !!navigator.serviceWorker.controller });

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    set({ controlled: true });
    // Only reload for an update the user asked for — not for the very first install.
    if (reloading || !state.updateReady) return;
    reloading = true;
    window.location.reload();
  });

  const build = process.env.NEXT_PUBLIC_APP_BUILD || "dev";
  const register = () =>
    navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(build)}`, { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        registration = reg;
        watchWaiting(reg);
        // A phone app stays open for days: look for a new version when it comes back to the front.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => undefined);
        });
      })
      .catch(() => undefined);
  if (document.readyState === "complete") void register();
  else window.addEventListener("load", () => void register(), { once: true });
}

/** «Обновить приложение»: activate the waiting worker; the page reloads on controllerchange. */
export function applyUpdate(): void {
  const waiting = registration?.waiting;
  if (waiting) waiting.postMessage({ type: "SKIP_WAITING" });
  else window.location.reload();
}

export async function promptInstall(): Promise<boolean> {
  if (!installEvent) return false;
  const ev = installEvent;
  installEvent = null;
  set({ canInstall: false });
  await ev.prompt();
  const choice = await ev.userChoice.catch(() => ({ outcome: "dismissed" as const }));
  return choice.outcome === "accepted";
}

/** The registration (for push); waits for the worker when it is still starting. */
export async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || !SW_ENABLED) return null;
  if (registration) return registration;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
  } catch {
    return null;
  }
}

export const swEnabled = SW_ENABLED;

// ---- install hint dismissal ---------------------------------------------------------------

const HINT_KEY = "admin-install-hint-dismissed";

export function installHintDismissed(): boolean {
  try {
    return !!localStorage.getItem(HINT_KEY);
  } catch {
    return false;
  }
}

export function dismissInstallHint(): void {
  try {
    localStorage.setItem(HINT_KEY, String(Date.now()));
  } catch {
    /* private mode */
  }
}
