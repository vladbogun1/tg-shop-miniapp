"use client";

import { useEffect } from "react";
import { useLatest } from "@shop/ui/use-latest";

export interface ReviewHotkeys {
  next: () => void;
  prev: () => void;
  publish: () => void;
  hide: () => void;
  reply: () => void;
  remove: () => void;
}

function typing(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/**
 * Клавиши очереди (ноутбук): J/K или ↓/↑ — следующий/предыдущий, P — опубликовать, H — скрыть, R — к полю ответа,
 * Del — удалить. Молчат в полях ввода, с Ctrl/Alt/Cmd и пока открыто любое окно (подтверждение, карточка заказа).
 */
export function useReviewHotkeys(enabled: boolean, keys: ReviewHotkeys) {
  const ref = useLatest(keys);
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || typing(e.target)) return;
      if (document.querySelector("[role=dialog], [role=alertdialog]")) return;
      const k = ref.current;
      const map: Record<string, () => void> = {
        j: k.next,
        ArrowDown: k.next,
        k: k.prev,
        ArrowUp: k.prev,
        p: k.publish,
        h: k.hide,
        r: k.reply,
        Delete: k.remove,
      };
      const fn = map[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, ref]);
}
