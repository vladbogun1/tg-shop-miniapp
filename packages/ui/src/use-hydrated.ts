"use client";

import { useSyncExternalStore } from "react";

/**
 * False during SSR and the hydration pass; true afterwards. Gate localStorage-backed UI (cart badge,
 * quantity) on it so the first client render matches the server HTML (React #418).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}
