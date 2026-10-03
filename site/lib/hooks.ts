"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

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

/** Locks page scroll while an overlay (drawer, sheet, lightbox) is open. */
export function useScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
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
