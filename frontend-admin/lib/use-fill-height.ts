"use client";

import { useLayoutEffect, type RefObject } from "react";

/**
 * Stretches the element down to the bottom of the viewport, so a board fits the screen and scrolls
 * inside itself (both axes, one scrollbar each) while the page stays put. The bottom gap is the
 * padding the surrounding <main> keeps under its content (28px on desktop, the tab bar + 20px on a
 * phone/tablet), or `gap` when given. Re-measured when the window or the content above it
 * (toolbars, banners) changes size. Never shorter than `min`.
 */
export function useFillHeight(ref: RefObject<HTMLElement | null>, enabled: boolean, gap?: number, min = 420) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const fit = () => {
      const main = el.closest("main");
      const bottom = gap ?? (main ? parseFloat(getComputedStyle(main).paddingBottom) || 28 : 28);
      const top = el.getBoundingClientRect().top + window.scrollY;
      const h = `${Math.max(min, Math.floor(window.innerHeight - top - bottom))}px`;
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
    // Deps matter: without them the cleanup would reset the height on every re-render and the
    // scrolled board would snap to the top (drag start, 30-second poll, «Показать ещё»).
  }, [ref, enabled, gap, min]);
}
