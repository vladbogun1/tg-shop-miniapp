import { webApp } from "./webapp";

/**
 * Opens an external page (the monobank payment page) without leaving the Mini App.
 *
 * Inside Telegram this is `WebApp.openLink`: the in-app / system browser slides OVER the Mini App,
 * and closing it brings the customer straight back to the same screen — see {@link onAppResume}.
 * Some clients only honour it from a user gesture, so callers also keep a button that calls this
 * again. Outside Telegram (plain browser, the `?tgstub=` dev stub, which has no openLink) it falls
 * back to a new tab, and to navigating this tab when a popup blocker eats that.
 */
export function openExternalLink(url: string, opts: { systemBrowser?: boolean } = {}): void {
  const wa = webApp();
  if (wa?.initData && typeof wa.openLink === "function") {
    try {
      const browser = opts.systemBrowser ? systemBrowser(wa.platform) : undefined;
      wa.openLink(url, browser ? { try_instant_view: false, try_browser: browser } : { try_instant_view: false });
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
 * The real browser for `openLink(…, { try_browser })`. Telegram's in-app browser is a webview, where
 * Google Pay fails (pay.google.com: "Something went wrong").
 *   - iOS: openLink always goes to the system DEFAULT browser (forceExternal) — nothing to ask for.
 *   - Desktop: the system browser anyway.
 *   - Android: Telegram's own browser, unless a browser is named; there is no "default browser"
 *     value. "chrome" → com.android.chrome (present wherever Google Pay works at all). If it is
 *     missing, Telegram opens NOTHING — see {@link isAndroidTelegram} and the caller's fallback.
 */
function systemBrowser(platform: string | undefined): string | undefined {
  return platform === "android" || platform === "android_x" ? "chrome" : undefined;
}

/** Inside Telegram for Android — where a named browser may silently fail to open. */
export function isAndroidTelegram(): boolean {
  const wa = webApp();
  return !!wa?.initData && (wa.platform === "android" || wa.platform === "android_x");
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
