"use client";

/**
 * Telegram Mini App provider/hook.
 *
 * Reads initData / user / platform from the official telegram-web-app.js (loaded in the layout
 * head), calls ready()/expand(), requests fullscreen on phones and mirrors Telegram's safe-area
 * insets into CSS variables. Gracefully no-ops in a plain browser (dev) so `npm run dev` works
 * outside Telegram.
 */
import { useEffect, useState } from "react";

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
 * The Neo-Brutalism look is a FIXED brand theme: light by default, dark via the in-app
 * ThemeToggle (persisted in localStorage). Telegram's themeParams deliberately do NOT drive it —
 * otherwise a customer with a dark Telegram client would get a dark shop. This only reports which
 * scheme is in effect; `data-theme` is owned by the layout's pre-paint script and the toggle.
 *
 * (The previous version took a `themeParams` argument it never read, and its result was chained
 * through `??` operators that could never fire.)
 */
function currentScheme(): "dark" | "light" {
  try {
    if (typeof window !== "undefined" && window.localStorage.getItem("neo-theme") === "dark") {
      return "dark";
    }
  } catch {
    /* storage blocked (private mode) — fall through to the default */
  }
  return "light";
}

/**
 * Push our layout below/around the Telegram chrome in fullscreen Mini Apps.
 * Combines the device safe area (notch) with Telegram's contentSafeAreaInset
 * (the strip occupied by the close / ⋮ / collapse controls) and writes it into
 * the --safe-* vars our headers/navbar already use. Uses max(env(), inset) so a
 * non-fullscreen client keeps its native env() insets.
 */
function applySafeAreaInsets(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const wa = (window as unknown as {
    Telegram?: {
      WebApp?: {
        safeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
        contentSafeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
      };
    };
  }).Telegram?.WebApp;
  if (!wa) return;
  const sa = wa.safeAreaInset ?? {};
  const csa = wa.contentSafeAreaInset ?? {};
  const root = document.documentElement;
  const set = (name: string, env: string, px: number) =>
    root.style.setProperty(name, `max(env(${env}, 0px), ${Math.max(0, px)}px)`);
  set("--safe-top", "safe-area-inset-top", (sa.top ?? 0) + (csa.top ?? 0));
  set("--safe-bottom", "safe-area-inset-bottom", (sa.bottom ?? 0) + (csa.bottom ?? 0));
  set("--safe-left", "safe-area-inset-left", (sa.left ?? 0) + (csa.left ?? 0));
  set("--safe-right", "safe-area-inset-right", (sa.right ?? 0) + (csa.right ?? 0));
}


/**
 * useTelegram — call once near the app root. Initializes the SDK and returns
 * the live state. Safe in SSR (returns defaults) and in plain browser (no-op).
 */
export function useTelegram(): TgState {
  const [state, setState] = useState<TgState>(DEFAULT_STATE);

  useEffect(() => {
    let cancelled = false;

    // Primary, most reliable source: the official telegram-web-app.js (loaded in
    // layout <head>) exposes window.Telegram.WebApp in every Telegram client.
    function readFromWebApp(): boolean {
      const wa = (window as unknown as {
        Telegram?: {
          WebApp?: {
            initData?: string;
            initDataUnsafe?: { user?: Record<string, unknown> };
            themeParams?: Record<string, unknown>;
            colorScheme?: "dark" | "light";
            ready?: () => void;
            expand?: () => void;
          };
        };
      }).Telegram?.WebApp;
      if (!wa || !wa.initData) return false; // not launched from Telegram

      try { wa.ready?.(); } catch { /* noop */ }
      try { wa.expand?.(); } catch { /* noop */ }

      // Fullscreen Mini App: request fullscreen on EVERY entry point (menu button,
      // inline web_app buttons, /start) — but ONLY on phones. On desktop/web
      // Telegram we keep the normal windowed popup (no forced fullscreen).
      try {
        const x = wa as unknown as {
          platform?: string;
          onEvent?: (e: string, cb: () => void) => void;
          requestFullscreen?: () => void;
          isVersionAtLeast?: (v: string) => boolean;
        };
        x.onEvent?.("safeAreaChanged", applySafeAreaInsets);
        x.onEvent?.("contentSafeAreaChanged", applySafeAreaInsets);
        x.onEvent?.("fullscreenChanged", applySafeAreaInsets);
        const isPhone = x.platform === "android" || x.platform === "ios";
        if (isPhone && (!x.isVersionAtLeast || x.isVersionAtLeast("8.0"))) {
          x.requestFullscreen?.();
        }
        applySafeAreaInsets();
      } catch { /* noop — older clients without fullscreen support */ }

      const u = wa.initDataUnsafe?.user as
        | { id: number; first_name?: string; last_name?: string; username?: string;
            language_code?: string; photo_url?: string }
        | undefined;
      const scheme = currentScheme();

      if (!cancelled) {
        setState({
          initDataRaw: wa.initData,
          user: u
            ? { id: u.id, firstName: u.first_name, lastName: u.last_name,
                username: u.username, languageCode: u.language_code, photoUrl: u.photo_url }
            : null,
          colorScheme: scheme,
          isTelegram: true,
          ready: true,
        });
      }
      return true;
    }

    // telegram-web-app.js is beforeInteractive, but be defensive: retry briefly.
    let tries = 0;
    const tick = () => {
      if (cancelled) return;
      if (readFromWebApp()) return;
      if (++tries > 10) {
        if (!cancelled) setState({ ...DEFAULT_STATE, ready: true }); // plain browser
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

// ---------------------------------------------------------------------------
// Raw window.Telegram.WebApp access (most stable surface across SDK versions).
// ---------------------------------------------------------------------------
interface WebAppMainButton {
  setText: (t: string) => void;
  show: () => void;
  hide: () => void;
  enable: () => void;
  disable: () => void;
  showProgress?: (leaveActive?: boolean) => void;
  hideProgress?: () => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
  setParams?: (p: Record<string, unknown>) => void;
}
interface WebApp {
  MainButton?: WebAppMainButton;
  initDataUnsafe?: { start_param?: string };
  HapticFeedback?: { impactOccurred?: (s: string) => void };
}

function webApp(): WebApp | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp ??
    null
  );
}

/**
 * Read the launch `start_param` / `startapp` value (e.g. "order_<id>").
 * Falls back to the URL query (?startapp= / ?tgWebAppStartParam=) for browser dev.
 */
export function getStartParam(): string | null {
  const wa = webApp();
  if (wa?.initDataUnsafe?.start_param) return wa.initDataUnsafe.start_param;
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search);
    return (
      q.get("startapp") ??
      q.get("tgWebAppStartParam") ??
      q.get("start_param") ??
      null
    );
  }
  return null;
}

/** Parse "order_<id>" deep-link → order id, else null. */
export function parseOrderDeepLink(param: string | null): string | null {
  if (!param) return null;
  const m = /^order[_-](.+)$/.exec(param);
  return m ? m[1] : null;
}

/**
 * Keeps Telegram's native MainButton hidden.
 *
 * The primary action is an in-page button instead: the native one duplicated it and ate vertical
 * space inside the WebApp. Called once from the app root — every screen used to invoke a no-op
 * `useMainButton(...)` whose arguments (label, click handler, loading state) were all ignored.
 */
export function useHideMainButton(): void {
  useEffect(() => {
    webApp()?.MainButton?.hide();
  }, []);
}

/** Best-effort light haptic tap. */
export function haptic(): void {
  try {
    webApp()?.HapticFeedback?.impactOccurred?.("light");
  } catch {
    /* noop */
  }
}
