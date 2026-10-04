"use client";

import { useLayoutEffect } from "react";
import { settlePreloader } from "@shop/shared";

/**
 * Pairs with components/Preloader.tsx. Runs on every mount of the root layout, before paint: reports
 * hydration on the first load, and hides the overlay when the layout is remounted later (language
 * switch), where the preloader's inline script does not run again. See settlePreloader().
 */
export function PreloaderReady() {
  useLayoutEffect(() => {
    settlePreloader();
  }, []);
  return null;
}
