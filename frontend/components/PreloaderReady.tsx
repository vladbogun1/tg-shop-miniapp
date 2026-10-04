"use client";

import { useEffect } from "react";

/** Tells the first-load preloader (components/Preloader.tsx) that React has hydrated. */
export function PreloaderReady() {
  useEffect(() => {
    (window as unknown as { __csPreloader?: { hydrated: () => void } }).__csPreloader?.hydrated();
  }, []);
  return null;
}
