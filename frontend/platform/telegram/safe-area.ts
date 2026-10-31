/** Отступы под хром Telegram (safe-area) → CSS-переменные --safe-*. */
/**
 * Push our layout below/around the Telegram chrome in fullscreen Mini Apps.
 * Combines the device safe area (notch) with Telegram's contentSafeAreaInset
 * (the strip occupied by the close / ⋮ / collapse controls) and writes it into
 * the --safe-* vars our headers/navbar already use. Uses max(env(), inset) so a
 * non-fullscreen client keeps its native env() insets.
 */
/** Height of Telegram's fullscreen controls strip (Закрыть · ⌄ · ⋮) when the client reports 0. */
const FULLSCREEN_CONTROLS_PX = 48;
/** Status bar height to assume when neither Telegram nor env() report it. */
const ANDROID_STATUS_BAR_PX = 28;

/** env(safe-area-inset-top) in px (0 when the WebView does not provide it). */
function envInsetTop(): number {
  try {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px)";
    document.body.appendChild(probe);
    const px = parseFloat(getComputedStyle(probe).paddingTop) || 0;
    probe.remove();
    return px;
  } catch {
    return 0;
  }
}

let safeAreaReported = false;
let lastSafeArea: {
  wa: { isFullscreen?: boolean; platform?: string; version?: string };
  sa: { top?: number; bottom?: number };
  csa: { top?: number; bottom?: number };
  fallback: boolean;
} | null = null;
/** One diagnostic event per page load: what Telegram actually reports (client_events, event "tg_safe_area"). */
function reportSafeArea(
  wa: { isFullscreen?: boolean; platform?: string; version?: string },
  sa: { top?: number; bottom?: number },
  csa: { top?: number; bottom?: number },
  fallback: boolean
): void {
  lastSafeArea = { wa, sa, csa, fallback };
  if (safeAreaReported) return;
  safeAreaReported = true;
  // Reported a moment later with the LATEST values: fullscreen and its insets arrive after the first call.
  window.setTimeout(() => {
    const { wa, sa, csa, fallback } = lastSafeArea!;
    const cs = getComputedStyle(document.documentElement);
    const meta = JSON.stringify({
      fs: wa.isFullscreen ?? null,
      pf: wa.platform,
      v: wa.version,
      sa: [sa.top ?? null, sa.bottom ?? null],
      csa: [csa.top ?? null, csa.bottom ?? null],
      tgVars: [cs.getPropertyValue("--tg-safe-area-inset-top").trim(), cs.getPropertyValue("--tg-content-safe-area-inset-top").trim()],
      fb: fallback,
      env: envInsetTop(),
      safeTop: getComputedStyle(document.querySelector(".sticky") ?? document.body).top,
      vh: window.innerHeight,
    });
    void import("@/lib/analytics").then((m) => m.track("tg_safe_area", undefined, meta.slice(0, 500))).catch(() => {});
  }, 2500);
}

type Inset = { top?: number; bottom?: number; left?: number; right?: number };
interface SafeAreaWebApp {
  safeAreaInset?: Inset;
  contentSafeAreaInset?: Inset;
  isFullscreen?: boolean;
  platform?: string;
  version?: string;
}

/**
 * Some Android clients (seen on Telegram-Android 12.10 fullscreen) report a 0 content inset while
 * the «Закрыть · ⌄ · ⋮» strip is drawn over the page: fall back to that strip's height (writes csa.top).
 * Returns whether the fallback was used.
 */
function applyControlsFallback(wa: SafeAreaWebApp, sa: Inset, csa: Inset): boolean {
  const phone = wa.platform === "android" || wa.platform === "ios";
  const fallback = !!wa.isFullscreen && phone && !(csa.top && csa.top > 0);
  if (fallback) {
    // Seen live (Telegram-Android 12.10.6, WebApp 9.6, fullscreen): safeAreaInset, contentSafeAreaInset and
    // the --tg-* CSS vars are ALL 0, so the status bar is missing too. Status bar = env() when the WebView
    // gives it, else a typical Android value; plus the controls strip.
    const statusBar = Math.max(sa.top ?? 0, envInsetTop()) || ANDROID_STATUS_BAR_PX;
    csa.top = statusBar - (sa.top ?? 0) + FULLSCREEN_CONTROLS_PX;
  }
  return fallback;
}

function writeSafeVars(sa: Inset, csa: Inset): void {
  const root = document.documentElement;
  // Also reads Telegram's own live CSS vars (--tg-safe-area-inset-*, --tg-content-safe-area-inset-*,
  // kept up to date by telegram-web-app.js): the JS values can be 0 when we read them (fullscreen is
  // applied a moment later) and a missed contentSafeAreaChanged left the header under Закрыть · ⌄ · ⋮.
  const set = (name: string, side: keyof Inset, px: number) =>
    root.style.setProperty(
      name,
      `max(env(safe-area-inset-${side}, 0px), ${Math.max(0, px)}px, calc(var(--tg-safe-area-inset-${side}, 0px) + var(--tg-content-safe-area-inset-${side}, 0px)))`
    );
  for (const side of ["top", "bottom", "left", "right"] as const) {
    set(`--safe-${side}`, side, (sa[side] ?? 0) + (csa[side] ?? 0));
  }
}

export function applySafeAreaInsets(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const wa = (window as unknown as { Telegram?: { WebApp?: SafeAreaWebApp } }).Telegram?.WebApp;
  if (!wa) return;
  const sa = wa.safeAreaInset ?? {};
  const csa = { ...(wa.contentSafeAreaInset ?? {}) };
  const fallback = applyControlsFallback(wa, sa, csa);
  reportSafeArea(wa, sa, wa.contentSafeAreaInset ?? {}, fallback);
  writeSafeVars(sa, csa);
}
