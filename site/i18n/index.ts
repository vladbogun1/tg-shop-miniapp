/**
 * Server-and-client safe entry point: dictionaries, `makeT`, and URL helpers.
 *
 * Server components call `makeT(locale)` with the locale from the route; client components use
 * `useT()` from `./context`, which is the same function bound by the provider.
 */
import { FALLBACK_LOCALE, LOCALES, LOCALE_PATTERN, translate, type Dictionary, type Locale, type Params } from "@shop/core/i18n";
import { en } from "./en";
import { ru, type MessageKey } from "./ru";
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
  const m = pathname.match(new RegExp(`^/(${LOCALE_PATTERN})(?=/|$)`));
  if (!m) return pathname || "/";
  const rest = pathname.slice(m[0].length);
  return rest || "/";
}

/** hreflang alternates for `generateMetadata`. */
export function alternates(path: string, current: Locale) {
  return {
    canonical: localePath(current, path),
    languages: {
      ...Object.fromEntries(LOCALES.map((l) => [l, localePath(l, path)])),
      "x-default": localePath(FALLBACK_LOCALE, path),
    },
  };
}
