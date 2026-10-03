"use client";

import { useMemo } from "react";
import { useI18n } from "@/i18n/context";
import { makeFmt, type Fmt } from "./format";

/** Money/date formatters bound to the language on screen. */
export function useFmt(): Fmt {
  const { locale } = useI18n();
  return useMemo(() => makeFmt(locale), [locale]);
}
