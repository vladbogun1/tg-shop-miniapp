"use client";

import { useLayoutEffect, type RefObject } from "react";

/**
 * Publishes an element's live height as a CSS variable on <html> (`--hdr-h` for the sticky top bar),
 * so things that stick below it can compute their `top` in plain CSS. Follows the element's size
 * (safe-area inset, wrapped title) through a ResizeObserver; the variable is removed on unmount.
 */
export function useCssVarHeight(ref: RefObject<HTMLElement | null>, name: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(name, `${Math.round(el.getBoundingClientRect().height)}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty(name);
    };
  }, [ref, name]);
}
