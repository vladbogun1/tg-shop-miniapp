/** Сырой доступ к window.Telegram.WebApp (самая стабильная поверхность между версиями SDK). */
// ---------------------------------------------------------------------------
export interface WebAppMainButton {
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
export interface WebApp {
  MainButton?: WebAppMainButton;
  initData?: string;
  initDataUnsafe?: { start_param?: string };
  HapticFeedback?: {
    impactOccurred?: (s: string) => void;
    notificationOccurred?: (s: "error" | "success" | "warning") => void;
    selectionChanged?: () => void;
  };
  /** "android", "ios", "tdesktop", "macos", "weba", … */
  platform?: string;
  /**
   * Bot API 6.1+: opens a link in the browser OVER the Mini App, which stays alive underneath.
   * `try_browser` (7.6+, undocumented but in telegram-web-app.js and the Android client): skip
   * Telegram's own in-app browser and hand the link to that system browser ("chrome", "safari", …).
   */
  openLink?: (url: string, options?: { try_instant_view?: boolean; try_browser?: string }) => void;
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

export function webApp(): WebApp | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp ??
    null
  );
}
