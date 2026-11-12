"use client";

/**
 * Ссылка на поле настроек (`/settings/<раздел>?tab=…#setting-<key>` или `#np-<панель>`): прокрутить к нему и подсветить.
 * Поле появляется после загрузки, а иногда — только после смены вкладки, раскрытия «Дополнительно» в «ИИ» или языка
 * приветствия бота, поэтому ищем его несколько кадров. Next не сообщает о смене одного якоря (pushState), так что
 * цель перечитывается при `hashchange` и при смене `trigger` (строка запроса: вкладка из ссылки).
 */
import { useEffect, useState } from "react";

const SETTING_PREFIX = "setting-";
const MAX_FRAMES = 30;
const FLASH = [{ boxShadow: "0 0 0 3px rgba(255,102,0,.6)" }, { boxShadow: "0 0 0 3px rgba(255,102,0,.6)", offset: 0.6 }, { boxShadow: "0 0 0 0 rgba(255,102,0,0)" }];

function readTarget(): string | null {
  let h: string;
  try {
    h = decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return null; // битый якорь (`%E0%A4%A`) — просто без подсветки
  }
  return h.startsWith(SETTING_PREFIX) || h.startsWith("np-") ? h : null;
}

/** id элемента, на который ведёт якорь адреса, или null. */
export function useHashTarget(trigger: string): string | null {
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    setTarget(readTarget());
    const on = () => setTarget(readTarget());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, [trigger]);
  return target;
}

/** Ключ настройки из цели (`setting-<key>`), иначе null. */
export function settingKeyOf(target: string | null): string | null {
  return target?.startsWith(SETTING_PREFIX) ? target.slice(SETTING_PREFIX.length) : null;
}

/** Когда `ready` и цель есть — прокрутить к ней (как только она станет видимой) и коротко подсветить; `nonce` — повторить для той же цели. */
export function useScrollToTarget(target: string | null, ready: boolean, nonce = 0) {
  useEffect(() => {
    if (!ready || !target) return;
    let frame = 0;
    let raf = 0;
    const tryScroll = () => {
      const el = document.getElementById(target);
      if (el && el.getClientRects().length > 0) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.animate?.(FLASH, { duration: 1800, easing: "ease-out" });
        return;
      }
      if (++frame < MAX_FRAMES) raf = requestAnimationFrame(tryScroll);
    };
    raf = requestAnimationFrame(tryScroll);
    return () => cancelAnimationFrame(raf);
  }, [target, ready, nonce]);
}
