"use client";

/** Платформа Mini App (интерфейс — @shop/customer/platform/platform): токен в памяти, события видимости вкладки. */
import type { Platform } from "@shop/customer/platform/platform";
import { getAccessToken, putCartOnUnload } from "@/lib/api";

function onVisibility(want: "visible" | "hidden", cb: () => void): () => void {
  const handler = () => {
    if (document.visibilityState === want) cb();
  };
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}

export const telegramPlatform: Platform = {
  kind: "telegram",
  // до обмена initData на токен запросы к /api/me/** получали 403 (docs/archive/UI-FIXES.md)
  canCallApi: () => getAccessToken() !== null,
  onForeground: (cb) => onVisibility("visible", cb),
  onBackground: (cb) => onVisibility("hidden", cb),
  putCartOnUnload,
};
