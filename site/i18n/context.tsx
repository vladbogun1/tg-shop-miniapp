"use client";

/**
 * Language on the client. Unlike the Mini App, the URL is the source of truth (`/`, `/ru`, `/en`),
 * so there is nothing to resolve: the provider receives the locale from the route segment, and the
 * switch in the header simply navigates to the same page under another prefix.
 */
import { createContext, useContext, useMemo } from "react";
import { setActiveLocale } from "./active";
import { localePath, makeT, type TFunction } from "./index";
import { LOCALE_TAG, type Locale } from "./locales";

export interface I18n {
  locale: Locale;
  tag: string;
  t: TFunction;
  /** Locale-prefixed href for a site path. */
  href: (path: string) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  // Set synchronously during render so formatters called in the same render already see it.
  setActiveLocale(locale);
  const value = useMemo<I18n>(
    () => ({
      locale,
      tag: LOCALE_TAG[locale],
      t: makeT(locale),
      href: (path: string) => localePath(locale, path),
    }),
    [locale]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

export function useT(): TFunction {
  return useI18n().t;
}
