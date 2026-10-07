"use client";

/**
 * Telegram Mini App provider/hook.
 *
 * Reads initData / user / platform from the official telegram-web-app.js (loaded in the layout
 * head), calls ready()/expand(), requests fullscreen on phones and mirrors Telegram's safe-area
 * insets into CSS variables. Gracefully no-ops in a plain browser (dev) so `npm run dev` works
 * outside Telegram.
 */
import { useEffect, useRef, useState } from "react";

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
      // Tint Telegram's own header/background to the page colour so the chrome blends in.
      try {
        const c = wa as unknown as {
          setHeaderColor?: (color: string) => void;
          setBackgroundColor?: (color: string) => void;
        };
        c.setHeaderColor?.("#0E0E10");
        c.setBackgroundColor?.("#0E0E10");
      } catch { /* noop — older clients */ }

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
  initData?: string;
  initDataUnsafe?: { start_param?: string };
  HapticFeedback?: {
    impactOccurred?: (s: string) => void;
    notificationOccurred?: (s: "error" | "success" | "warning") => void;
  };
  /** Bot API 6.1+: opens a link in the browser OVER the Mini App, which stays alive underneath. */
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
  /**
   * Bot API 8.0+: the client's own "download file" dialog (https URL only). Older clients throw
   * WebAppMethodUnsupported; `callback(accepted)` says whether the customer confirmed it.
   */
  downloadFile?: (params: { url: string; file_name: string }, callback?: (accepted: boolean) => void) => void;
  isVersionAtLeast?: (version: string) => boolean;
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
  /** Bot API 6.1+: the native "back" arrow in the header (and Android's hardware back). */
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
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

/** `view_<id>` — open the order page itself (the bot's "payment received" message). */
export function parseOrderViewDeepLink(param: string | null): string | null {
  if (!param) return null;
  const m = /^view[_-](.+)$/.exec(param);
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

/** Best-effort "success" haptic (payment went through). */
export function hapticSuccess(): void {
  try {
    webApp()?.HapticFeedback?.notificationOccurred?.("success");
  } catch {
    /* noop */
  }
}

/**
 * Opens an external page (the monobank payment page) without leaving the Mini App.
 *
 * Inside Telegram this is `WebApp.openLink`: the in-app / system browser slides OVER the Mini App,
 * and closing it brings the customer straight back to the same screen — see {@link onAppResume}.
 * Some clients only honour it from a user gesture, so callers also keep a button that calls this
 * again. Outside Telegram (plain browser, the `?tgstub=` dev stub, which has no openLink) it falls
 * back to a new tab, and to navigating this tab when a popup blocker eats that.
 */
export function openExternalLink(url: string): void {
  const wa = webApp();
  if (wa?.initData && typeof wa.openLink === "function") {
    try {
      wa.openLink(url, { try_instant_view: false });
      return;
    } catch {
      /* fall through to the browser way */
    }
  }
  if (typeof window === "undefined") return;
  // No "noopener" feature: with it window.open always returns null and the blocked-popup check
  // below could not tell success from failure. The opener is cut by hand instead.
  const tab = window.open(url, "_blank");
  if (tab) tab.opener = null;
  else window.location.href = url;
}

/**
 * Downloads a file (a receipt PDF) from inside the Mini App.
 *
 * A webview ignores `<a download>`, and a link carrying an Authorization header is impossible here,
 * so the URL must be self-authorising (a signed link). Telegram 8.0+ shows its native download
 * dialog (`WebApp.downloadFile`); older clients — and anything that throws — get the URL opened
 * in the browser over the Mini App ({@link openExternalLink}), which downloads it there.
 */
export function downloadFile(url: string, fileName: string): void {
  const wa = webApp();
  const supported =
    !!wa?.initData &&
    typeof wa.downloadFile === "function" &&
    (typeof wa.isVersionAtLeast !== "function" || wa.isVersionAtLeast("8.0"));
  if (supported && url.startsWith("https://")) {
    try {
      wa!.downloadFile!({ url, file_name: fileName });
      return;
    } catch {
      /* unsupported after all — open it in the browser */
    }
  }
  openExternalLink(url);
}

/**
 * Calls `cb` whenever the customer comes back to the Mini App — the browser opened by
 * {@link openExternalLink} was closed, the app was brought back from the background, or Telegram
 * re-activated the Mini App (Bot API 8.0 `activated`). Several of these fire for one return, so
 * the callback must be cheap or debounced by the caller. Returns an unsubscribe function.
 */
export function onAppResume(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onVisibility = () => {
    if (document.visibilityState === "visible") cb();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", cb);
  const wa = webApp();
  try {
    wa?.onEvent?.("activated", cb);
  } catch {
    /* older clients: visibility/focus still cover it */
  }
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", cb);
    try {
      wa?.offEvent?.("activated", cb);
    } catch {
      /* noop */
    }
  };
}

/**
 * While `active`, shows Telegram's native back button and routes it — and Android's hardware back,
 * which would otherwise close the whole Mini App — to `onBack`. Used by full-screen overlays (the
 * payment sheet). No-op outside Telegram.
 */
export function useBackButton(active: boolean, onBack: () => void): void {
  const cb = useRef(onBack);
  useEffect(() => {
    cb.current = onBack;
  });
  useEffect(() => {
    if (!active) return;
    const bb = webApp()?.initData ? webApp()?.BackButton : undefined;
    if (!bb) return;
    const handler = () => cb.current();
    try {
      bb.onClick(handler);
      bb.show();
    } catch {
      return;
    }
    return () => {
      try {
        bb.offClick(handler);
        bb.hide();
      } catch {
        /* noop */
      }
    };
  }, [active]);
}

/** Schemes a payment page may never make us navigate to. */
const UNSAFE_SCHEMES = new Set(["javascript:", "data:", "vbscript:", "file:", "blob:", "about:", "http:"]);

/**
 * Opens a link the embedded monobank page asks for (`monopay-link`: pay in the monobank app).
 *
 * `WebApp.openLink` accepts http(s) only — telegram-web-app.js throws on anything else — so a
 * universal https link goes through {@link openExternalLink} (the OS hands it to the bank app when
 * it is installed), while a custom scheme (`monobank://…`, Android `intent:`) is navigated to
 * directly: the webview passes it to the OS and the Mini App page stays where it is. Script-ish and
 * plain-http URLs are ignored.
 */
export function openAppLink(raw: string): void {
  if (typeof window === "undefined") return;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return;
  }
  if (url.protocol === "https:") {
    openExternalLink(url.href);
    return;
  }
  if (UNSAFE_SCHEMES.has(url.protocol)) return;
  try {
    window.location.href = url.href;
  } catch {
    /* the webview refused the scheme */
  }
}
