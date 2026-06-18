"use client";

/**
 * Telegram Mini App provider/hook.
 *
 * Initializes @telegram-apps/sdk-react: ready/expand, reads initData, applies
 * theme (themeParams -> CSS variables --accent / --bg-scene + data-theme on
 * <html>). Gracefully no-ops in a plain browser (dev) so `npm run dev` works
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
 * Apply Telegram themeParams to our Liquid Glass CSS variables.
 * Accent comes from the user's Telegram theme (design doc §8.1 / §8.2).
 */
function applyTheme(params: Record<string, unknown> | undefined): "dark" | "light" {
  if (typeof document === "undefined" || !params) return "dark";
  const root = document.documentElement;

  const accent = (params.button_color || params.accent_text_color) as string | undefined;
  if (accent) root.style.setProperty("--accent", accent);

  const bg = (params.secondary_bg_color || params.bg_color) as string | undefined;
  if (bg) {
    root.style.setProperty(
      "--bg-scene",
      `radial-gradient(120% 120% at 0% 0%, ${bg} 0%, ${bg} 60%)`
    );
  }

  // Telegram exposes bg_color; derive light/dark by luminance.
  const bgColor = (params.bg_color as string | undefined) ?? "#0c1118";
  const scheme = isLight(bgColor) ? "light" : "dark";
  root.setAttribute("data-theme", scheme);
  return scheme;
}

function isLight(hex: string): boolean {
  const m = hex.replace("#", "");
  if (m.length < 6) return false;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  // Relative luminance
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
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

      const u = wa.initDataUnsafe?.user as
        | { id: number; first_name?: string; last_name?: string; username?: string;
            language_code?: string; photo_url?: string }
        | undefined;
      const scheme = applyTheme(wa.themeParams) ?? wa.colorScheme ?? "dark";

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
 * useMainButton — INTENTIONALLY DISABLED.
 *
 * We no longer drive the Telegram native MainButton: it duplicated the in-page
 * primary button and ate vertical screen space inside the WebApp. Every caller
 * already renders its own in-page GlassButton, so this hook now only hides any
 * native MainButton that might be showing and always reports isTelegram=false
 * (so callers keep showing their in-page button). Signature kept for callers.
 */
export function useMainButton(_opts: {
  text: string;
  onClick: () => void;
  visible?: boolean;
  enabled?: boolean;
  loading?: boolean;
}): { isTelegram: boolean } {
  useEffect(() => {
    const mb = webApp()?.MainButton;
    mb?.hide();
  }, []);
  return { isTelegram: false };
}

/** Best-effort light haptic tap. */
export function haptic(): void {
  try {
    webApp()?.HapticFeedback?.impactOccurred?.("light");
  } catch {
    /* noop */
  }
}
