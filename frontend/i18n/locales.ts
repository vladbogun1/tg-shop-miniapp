/**
 * The languages the customer app speaks.
 *
 * Ukrainian is the fallback rather than Russian: the shop sells in Ukraine, and roughly a tenth of
 * the customer base reaches the app with no language at all in their Telegram profile. Those people
 * get Ukrainian; everyone whose Telegram says otherwise gets what it says.
 *
 * The admin panel stays Russian and does not use any of this — one seller, one language, and
 * translating 800 back-office strings would buy nothing.
 */

export const LOCALES = ["uk", "ru", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const FALLBACK_LOCALE: Locale = "uk";

/**
 * Each language is named in ITSELF. If the app opens in a language you cannot read, "украинский"
 * does not help you find your own — "Українська" does.
 */
export const LOCALE_NAME: Record<Locale, string> = {
  uk: "Українська",
  ru: "Русский",
  en: "English",
};

/** Two letters for the compact header switch. Never a flag: a flag is a country, not a language. */
export const LOCALE_SHORT: Record<Locale, string> = {
  uk: "UA",
  ru: "RU",
  en: "EN",
};

/**
 * BCP-47 tag for Intl (dates, number grouping).
 *
 * en-GB rather than en-US on purpose: day-first dates and a 24-hour clock match what a customer in
 * Ukraine expects to see, whichever language they read.
 */
export const LOCALE_TAG: Record<Locale, string> = {
  uk: "uk-UA",
  ru: "ru-RU",
  en: "en-GB",
};

/** Narrows anything (a Telegram language_code, a stored value) to a language we actually have. */
export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const base = value.toLowerCase().split(/[-_]/)[0];
  return (LOCALES as readonly string[]).includes(base) ? (base as Locale) : null;
}
