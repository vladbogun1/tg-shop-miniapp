"use client";

import { useLayoutEffect, type RefObject } from "react";

/**
 * Height of a sticky side panel = from where it is NOW down to the bottom of the viewport (minus `gap`).
 * A fixed `100dvh − header` only fits once the panel has stuck; before the page scrolls it sits under the page
 * title and its bottom (the action buttons) was below the screen. Re-measured on scroll/resize, once per frame.
 */
export function useStickyFit(ref: RefObject<HTMLElement | null>, enabled: boolean, gap = 12, min = 360) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    let raf = 0;
    const fit = () => {
      raf = 0;
      const top = Math.max(el.getBoundingClientRect().top, 0);
      const h = `${Math.max(min, Math.floor(window.innerHeight - top - gap))}px`;
      if (el.style.height !== h) el.style.height = h;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(fit);
    };
    fit();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      el.style.height = "";
    };
  }, [ref, enabled, gap, min]);
}
