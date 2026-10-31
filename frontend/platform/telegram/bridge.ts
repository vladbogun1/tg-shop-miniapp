"use client";

/**
 * Telegram Mini App: мост и initData.
 *
 * Читает initData / user / platform из официального telegram-web-app.js (грузится в head layout),
 * вызывает ready()/expand(), просит fullscreen на телефонах и зеркалит safe-area в CSS-переменные.
 * В обычном браузере (dev) — no-op, поэтому `npm run dev` работает вне Telegram.
 */
import { useEffect, useState } from "react";
import { applySafeAreaInsets } from "./safe-area";

export interface TgUser {
  id: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
  photoUrl?: string;
}

export interface TgState {
  /** Raw initData string to POST to /api/auth/telegram. null in plain browser. */
  initDataRaw: string | null;
  user: TgUser | null;
  /** "dark" | "light" — resolved theme (best effort). */
  colorScheme: "dark" | "light";
  /** true if running inside a real Telegram webview. */
  isTelegram: boolean;
  ready: boolean;
}

const DEFAULT_STATE: TgState = {
  initDataRaw: null,
  user: null,
  colorScheme: "dark",
  isTelegram: false,
  ready: false,
};

/**
 * The ChiSetup look (v3) is ONE fixed dark brand theme. Telegram's themeParams deliberately do
 * NOT drive it, and there is no in-app toggle any more, so this always reports "dark".
 */
function currentScheme(): "dark" | "light" {
  return "dark";
}

interface BridgeWebApp {
  initData?: string;
  initDataUnsafe?: { user?: RawUser };
  themeParams?: Record<string, unknown>;
  colorScheme?: "dark" | "light";
  platform?: string;
  ready?: () => void;
  expand?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  onEvent?: (e: string, cb: () => void) => void;
  requestFullscreen?: () => void;
  isVersionAtLeast?: (v: string) => boolean;
}

interface RawUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

/** ready(), expand() and tinting Telegram's own header/background to the page colour (older clients: noop). */
function announceReady(wa: BridgeWebApp): void {
  try { wa.ready?.(); } catch { /* noop */ }
  try { wa.expand?.(); } catch { /* noop */ }
  try {
    wa.setHeaderColor?.("#0E0E10");
    wa.setBackgroundColor?.("#0E0E10");
  } catch { /* noop — older clients */ }
}

/**
 * Fullscreen Mini App: request fullscreen on EVERY entry point (menu button,
 * inline web_app buttons, /start) — but ONLY on phones. On desktop/web
 * Telegram we keep the normal windowed popup (no forced fullscreen).
 */
function setUpFullscreen(wa: BridgeWebApp): void {
  try {
    wa.onEvent?.("safeAreaChanged", applySafeAreaInsets);
    wa.onEvent?.("contentSafeAreaChanged", applySafeAreaInsets);
    wa.onEvent?.("fullscreenChanged", applySafeAreaInsets);
    const isPhone = wa.platform === "android" || wa.platform === "ios";
    if (isPhone && (!wa.isVersionAtLeast || wa.isVersionAtLeast("8.0"))) {
      wa.requestFullscreen?.();
    }
    applySafeAreaInsets();
  } catch { /* noop — older clients without fullscreen support */ }
}

function toTgUser(u: RawUser | undefined): TgUser | null {
  if (!u) return null;
  return { id: u.id, firstName: u.first_name, lastName: u.last_name,
    username: u.username, languageCode: u.language_code, photoUrl: u.photo_url };
}

/**
 * Primary, most reliable source: the official telegram-web-app.js (loaded in layout <head>)
 * exposes window.Telegram.WebApp in every Telegram client. null when not launched from Telegram.
 */
function readWebApp(): TgState | null {
  const wa = (window as unknown as { Telegram?: { WebApp?: BridgeWebApp } }).Telegram?.WebApp;
  if (!wa || !wa.initData) return null;
  announceReady(wa);
  setUpFullscreen(wa);
  return {
    initDataRaw: wa.initData,
    user: toTgUser(wa.initDataUnsafe?.user),
    colorScheme: currentScheme(),
    isTelegram: true,
    ready: true,
  };
}

/**
 * useTelegram — call once near the app root. Initializes the SDK and returns
 * the live state. Safe in SSR (returns defaults) and in plain browser (no-op).
 */
export function useTelegram(): TgState {
  const [state, setState] = useState<TgState>(DEFAULT_STATE);

  useEffect(() => {
    let cancelled = false;

    // telegram-web-app.js is beforeInteractive, but be defensive: retry briefly.
    let tries = 0;
    const tick = () => {
      if (cancelled) return;
      const found = readWebApp();
      if (found) {
        setState(found);
        return;
      }
      if (++tries > 10) {
        setState({ ...DEFAULT_STATE, ready: true }); // plain browser
        return;
      }
      setTimeout(tick, 100);
    };
    tick();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
