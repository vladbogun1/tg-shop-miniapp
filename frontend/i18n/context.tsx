"use client";

/**
 * Language for the customer app.
 *
 * Resolution order, first hit wins: what this person picked before (kept on the device) → the
 * language their Telegram account is set to → Ukrainian.
 *
 * Nobody is asked "choose a language" on first launch. Telegram already knows, and an extra modal
 * in front of a shop is a good way to lose the sale.
 *
 * The first render deliberately uses the fallback on BOTH server and client, and the real language
 * is applied in a layout effect — that keeps hydration consistent while still swapping the text
 * before the browser paints, so there is no visible flash of the wrong language.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAccessToken, onAccessToken, customerApi } from "@/lib/api";
import {
  type Dictionary,
  FALLBACK_LOCALE,
  type Locale,
  LOCALE_TAG,
  normalizeLocale,
  type Params,
  setActiveLocale,
  translate,
} from "@shop/shared";
import { ru } from "./ru";
import { uk } from "./uk";
import { en } from "./en";

const STORAGE_KEY = "locale";

const DICTIONARIES: Record<Locale, Dictionary> = { ru, uk, en };

export interface I18n {
  locale: Locale;
  /** BCP-47 tag for Intl (dates, numbers). */
  tag: string;
  t: (key: string, params?: Params) => string;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18n | null>(null);

/** What the device remembers, or what Telegram says, or the fallback. Client-side only. */
function resolveLocale(): Locale {
  try {
    const stored = normalizeLocale(localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
  } catch {
    /* private mode — fall through to Telegram */
  }
  const fromTelegram = normalizeLocale(
    (
      window as unknown as {
        Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } };
      }
    ).Telegram?.WebApp?.initDataUnsafe?.user?.language_code
  );
  return fromTelegram ?? FALLBACK_LOCALE;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(FALLBACK_LOCALE);

  useLayoutEffect(() => {
    const resolved = resolveLocale();
    setActiveLocale(resolved);
    setLocaleState(resolved);
  }, []);

  // Layout effect, not a plain one: `lang` drives hyphenation and what a screen reader announces,
  // and both should be right before the first paint rather than a frame later.
  // `lang` drives hyphenation and what a screen reader announces, so it is set before paint.
  useLayoutEffect(() => {
    document.documentElement.lang = LOCALE_TAG[locale];
  }, [locale]);

  // Tell the server, so the bot writes to this person in the same language the app speaks.
  // Only once there is a token — before that there is nobody to attribute the preference to.
  useEffect(() => {
    const push = (token: string | null) => {
      if (!token) return;
      customerApi.setLocale(locale).catch(() => {
        /* a preference that failed to sync is not worth bothering anyone about */
      });
    };
    push(getAccessToken());
    return onAccessToken(push);
  }, [locale]);

  const queryClient = useQueryClient();
  const setLocale = useCallback((next: Locale) => {
    // Formatters read this synchronously, so it must be set before the re-render, not after.
    setActiveLocale(next);
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* the choice still applies for this session */
    }
    // Catalog content (titles, descriptions, variants, tags, payment options) now comes back
    // translated per Accept-Language, but the query keys carry no language: refetch on a switch so
    // the remounted screens do not show the previous language from the cache.
    void queryClient.invalidateQueries();
  }, [queryClient]);

  const value = useMemo<I18n>(() => {
    const dict = DICTIONARIES[locale];
    return {
      locale,
      tag: LOCALE_TAG[locale],
      t: (key: string, params?: Params) => translate(dict, locale, key, params),
      setLocale,
    };
  }, [locale, setLocale]);

  return (
    <I18nContext.Provider value={value}>
      {/* Remounting on a language change is deliberate. Dates and prices are formatted by plain
          functions that read the active locale (getActiveLocale in @shop/shared), so a component that shows a price
          but no translated text would otherwise keep the old formatting until something else
          re-rendered it. Switching language is a rare, deliberate action — a clean remount costs
          nothing and removes a whole class of half-translated screens. */}
      <div key={locale} className="contents">
        {children}
      </div>
    </I18nContext.Provider>
  );
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used inside <I18nProvider>");
  }
  return ctx;
}

/** Shorthand for the common case of only needing the lookup function. */
export function useT(): (key: string, params?: Params) => string {
  return useI18n().t;
}
