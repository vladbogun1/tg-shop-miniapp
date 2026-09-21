/**
 * Dictionary shape and lookup.
 *
 * Keys are FLAT and dotted ("cart.empty.title"), not nested objects. Flat keys make the other
 * languages structurally checkable — `Record<keyof typeof ru, Phrase>` means a missing or misspelt
 * key in Ukrainian or English is a compile error, not a Russian word appearing mid-sentence in
 * production.
 */
import { LOCALE_TAG, type Locale } from "./locales";

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
