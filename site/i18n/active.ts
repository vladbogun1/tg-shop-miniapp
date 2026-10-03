/**
 * The language currently on screen, readable from plain functions in the BROWSER (money and date
 * formatters, the HTTP client's Accept-Language). Server components never read this — they get the
 * locale from the route and pass it explicitly — because module state on the server is shared
 * between concurrent requests in different languages.
 */
import { FALLBACK_LOCALE, LOCALE_TAG, type Locale } from "./locales";

let active: Locale = FALLBACK_LOCALE;

export function setActiveLocale(locale: Locale): void {
  active = locale;
}

export function getActiveLocale(): Locale {
  return active;
}

export function getActiveTag(): string {
  return LOCALE_TAG[active];
}
