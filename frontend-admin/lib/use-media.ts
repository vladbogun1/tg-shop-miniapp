"use client";

import { useSyncExternalStore } from "react";

/**
 * Live `matchMedia` result. Server render and the first client render return `fallback`
 * (no hydration mismatch); then it follows the real viewport.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined") return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => fallback
  );
}

/** Tailwind `lg` breakpoint — where the board switches from the mobile list to the kanban. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)", true);
}

/** Touch-first device: Enter in the chat inserts a new line instead of sending. */
export function useCoarsePointer(): boolean {
  return useMediaQuery("(pointer: coarse)", false);
}
