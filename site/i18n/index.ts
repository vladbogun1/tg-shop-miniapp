/**
 * Server-and-client safe entry point: dictionaries, `makeT`, and URL helpers.
 *
 * Server components call `makeT(locale)` with the locale from the route; client components use
 * `useT()` from `./context`, which is the same function bound by the provider.
 */
import { en } from "./en";
import { LOCALE_TAG, FALLBACK_LOCALE, type Locale } from "./locales";
import { ru, type MessageKey } from "./ru";
import { translate, type Dictionary, type Params } from "./types";
import { uk } from "./uk";

export type { MessageKey };
export type TFunction = (key: MessageKey, params?: Params) => string;

const DICTIONARIES: Record<Locale, Dictionary> = { ru, uk, en };

export function makeT(locale: Locale): TFunction {
  const dict = DICTIONARIES[locale];
  return (key, params) => translate(dict, locale, key, params);
}

/** Prefixes a site path with the locale segment (`/catalog` → `/ru/catalog`; uk has none). */
export function localePath(locale: Locale, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === FALLBACK_LOCALE) return clean;
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
}

/** Strips a leading `/ru` or `/en` from a pathname — the inverse of {@link localePath}. */
export function stripLocale(pathname: string): string {
  const m = pathname.match(/^\/(ru|en|uk)(?=\/|$)/);
  if (!m) return pathname || "/";
  const rest = pathname.slice(m[0].length);
  return rest || "/";
}

/** hreflang alternates for `generateMetadata`. */
export function alternates(path: string, current: Locale) {
  return {
    canonical: localePath(current, path),
    languages: {
      uk: localePath("uk", path),
      ru: localePath("ru", path),
      en: localePath("en", path),
      "x-default": localePath("uk", path),
    },
  };
}

export function localeTag(locale: Locale): string {
  return LOCALE_TAG[locale];
}
