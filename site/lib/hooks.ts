"use client";

import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";

/** False during SSR and the hydration pass; true afterwards (for localStorage-backed UI). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

/** Value that settles `delay` ms after the last change. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

/**
 * Locks page scroll while an overlay (drawer, sheet, lightbox) is open.
 *
 * `overflow: hidden` on <body> hides the classic (Windows/Linux desktop) scrollbar, so the page got
 * ~15px wider and every centred block jumped sideways the moment an overlay opened — and back when
 * it closed. That jump, seen through the fading backdrop, is half of the "flash" on the product
 * photo viewer. The scrollbar's width is handed back to header/main/footer as padding (see
 * `body[data-scroll-lock]` in globals.css), so the layout does not move. Nested locks are counted.
 * Layout effect: applied in the same frame the overlay mounts, before paint.
 */
let lockCount = 0;
let savedOverflow = "";

export function useScrollLock(locked: boolean): void {
  useLayoutEffect(() => {
    if (!locked) return;
    const body = document.body;
    if (lockCount === 0) {
      const gap = window.innerWidth - document.documentElement.clientWidth;
      savedOverflow = body.style.overflow;
      body.style.setProperty("--scroll-lock-gap", `${Math.max(0, gap)}px`);
      body.setAttribute("data-scroll-lock", "");
      body.style.overflow = "hidden";
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount > 0) return;
      body.style.overflow = savedOverflow;
      body.removeAttribute("data-scroll-lock");
      body.style.removeProperty("--scroll-lock-gap");
    };
  }, [locked]);
}

/** Calls `onEscape` when Escape is pressed while `active`. */
export function useEscape(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [active, onEscape]);
}

export function copyText(value: string): Promise<boolean> {
  return navigator.clipboard?.writeText(value).then(
    () => true,
    () => false
  ) ?? Promise.resolve(false);
}
