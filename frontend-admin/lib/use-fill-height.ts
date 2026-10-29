"use client";

import { useLayoutEffect, type RefObject } from "react";

/**
 * Stretches the element down to the bottom of the viewport (minus `gap`), so a board fits the
 * screen: the page itself does not scroll, its columns do. Re-measured when the window or the
 * content above it (toolbars, banners) changes size. Never shorter than `min`.
 *
 * Runs only when `enabled` flips, not on every render: the cleanup drops the height, and for that
 * instant the columns grew to their full content, so the browser reset their scroll to the top —
 * opening an order at the bottom of «Отправлен» threw the column back up.
 */
export function useFillHeight(ref: RefObject<HTMLElement | null>, enabled: boolean, gap = 28, min = 420) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const h = `${Math.max(min, Math.floor(window.innerHeight - top - gap))}px`;
      if (el.style.height !== h) el.style.height = h;
    };
    fit();
    // Everything that sits above the element (toolbars, a banner that appears later) moves it.
    const ro = new ResizeObserver(fit);
    ro.observe(document.body);
    for (let node: HTMLElement | null = el; node && node !== document.body; node = node.parentElement) {
      // An ancestor grows when something is inserted above (e.g. a strip that loads later).
      if (node !== el) ro.observe(node);
      for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) ro.observe(sib);
    }
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
      el.style.height = "";
    };
  }, [ref, enabled, gap, min]);
}
