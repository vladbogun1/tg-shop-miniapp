"use client";

/**
 * Minimal Telegram WebApp bridge for admin login.
 * Reads window.Telegram.WebApp.initData when the panel is opened inside Telegram.
 */

interface TelegramWebApp {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
}
interface TelegramNS {
  WebApp?: TelegramWebApp;
}

function tg(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { Telegram?: TelegramNS };
  return w.Telegram?.WebApp ?? null;
}

/** Raw initData string from Telegram WebApp, or null in a plain browser. */
export function getTelegramInitData(): string | null {
  const app = tg();
  if (!app) return null;
  app.ready?.();
  app.expand?.();
  return app.initData && app.initData.length > 0 ? app.initData : null;
}
