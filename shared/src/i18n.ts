/**
 * Languages of the customer Mini App and the website (one set for both).
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

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

// ── the language currently on screen ────────────────────────────────────────

/*
 * Readable from plain functions in the BROWSER: `money()`, the date helpers and the HTTP client's
 * Accept-Language are called from everywhere (components, helpers, `useMemo` bodies), and threading
 * a locale through a hundred call sites would buy nothing. Each app's I18nProvider is the only
 * writer and remounts the tree on a change, so nothing renders with the previous language.
 *
 * Server components never read this — they get the locale from the route and pass it explicitly —
 * because module state on the server is shared between concurrent requests in different languages.
 */
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

// ── dictionaries ────────────────────────────────────────────────────────────

/*
 * Dictionary shape and lookup.
 *
 * Keys are FLAT and dotted ("cart.empty.title"), not nested objects. Flat keys make the other
 * languages structurally checkable — `Record<keyof typeof ru, Phrase>` means a missing or misspelt
 * key in Ukrainian or English is a compile error, not a Russian word appearing mid-sentence in
 * production.
 */

/**
 * Plural forms, named after the CLDR categories `Intl.PluralRules` returns.
 *
 * Russian and Ukrainian both need three ("1 товар / 2 товари / 5 товарів"); English needs two.
 * Which ones a language actually uses is decided by Intl, not by us — `other` is the only one
 * every language has, so it is the only one required.
 */
export interface PluralPhrase {
  one?: string;
  few?: string;
  many?: string;
  other: string;
}

export type Phrase = string | PluralPhrase;

export type Dictionary = Record<string, Phrase>;

/** Values interpolated into `{placeholders}`; `n` also selects the plural form. */
export type Params = Record<string, string | number>;

function isPlural(phrase: Phrase): phrase is PluralPhrase {
  return typeof phrase !== "string";
}

/**
 * Resolves one key against a dictionary.
 *
 * A missing key returns the key itself rather than an empty string: a visible "cart.total" in the
 * UI is an obvious bug report, whereas a blank space is a mystery. In development it also shouts
 * in the console.
 */
export function translate(
  dict: Dictionary,
  locale: Locale,
  key: string,
  params?: Params
): string {
  const phrase = dict[key];
  if (phrase === undefined) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[i18n] missing key "${key}" for locale "${locale}"`);
    }
    return key;
  }

  let text: string;
  if (isPlural(phrase)) {
    const n = Number(params?.n ?? 0);
    const category = new Intl.PluralRules(LOCALE_TAG[locale]).select(n);
    text = phrase[category as keyof PluralPhrase] ?? phrase.other;
  } else {
    text = phrase;
  }

  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name])
  );
}
