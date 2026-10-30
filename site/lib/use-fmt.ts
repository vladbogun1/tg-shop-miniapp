"use client";

import { useMemo } from "react";
import { useI18n } from "@/i18n/context";
import { useHydrated } from "./hooks";
import { makeFmt, SHOP_TIME_ZONE, type Fmt } from "./format";

/**
 * Money/date formatters bound to the language on screen. Dates are in the viewer's zone after
 * hydration; before it they are in the shop's zone, like the server HTML (no React #418).
 */
export function useFmt(): Fmt {
  const { locale } = useI18n();
  const hydrated = useHydrated();
  return useMemo(() => makeFmt(locale, hydrated ? undefined : SHOP_TIME_ZONE), [locale, hydrated]);
}
