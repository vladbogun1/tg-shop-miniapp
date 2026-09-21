/**
 * The language currently on screen, readable from plain functions.
 *
 * `money()` and the date helpers are called from everywhere — inside components, inside helper
 * functions, inside `useMemo` bodies — and turning every one of them into a hook would have meant
 * rewriting a hundred call sites to thread a locale through. They read it from here instead.
 *
 * This is module state on purpose, and it is safe because the app shows exactly one language at a
 * time: {@link I18nProvider} is the only writer, and it also remounts the tree on a change, so
 * nothing can be left rendering with the previous language's formatting.
 */
import { FALLBACK_LOCALE, LOCALE_TAG, type Locale } from "./locales";

let active: Locale = FALLBACK_LOCALE;

export function setActiveLocale(locale: Locale): void {
  active = locale;
}

export function getActiveLocale(): Locale {
  return active;
}

/** BCP-47 tag for Intl. */
export function getActiveTag(): string {
  return LOCALE_TAG[active];
}
