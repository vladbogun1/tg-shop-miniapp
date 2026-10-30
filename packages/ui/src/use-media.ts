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
