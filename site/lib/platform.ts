"use client";

/** Платформа сайта (интерфейс — @shop/customer/platform/platform): сессия в HttpOnly-cookie, фокус окна и видимость вкладки. */
import type { Platform } from "@shop/customer/platform/platform";
import { putCartOnUnload } from "./api";

export const webPlatform: Platform = {
  kind: "web",
  // сессия в cookie: запрос всегда можно отправить, а 401 разбирает сам вызов (api.ts → обновить сессию и повторить)
  canCallApi: () => true,
  onForeground(cb) {
    // `focus` и `visibilitychange` обычно приходят вместе — движок сам пропускает второе перечитывание
    const onVisibility = () => {
      if (document.visibilityState === "visible") cb();
    };
    window.addEventListener("focus", cb);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", cb);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  },
  onBackground(cb) {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") cb();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  },
  putCartOnUnload,
};
