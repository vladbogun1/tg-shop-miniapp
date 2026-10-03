import { isLocale, type Locale } from "@/i18n/locales";

/** Route params as Next 15 passes them. */
export type LocaleParams = Promise<{ locale: string }>;

export async function localeOf(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  return isLocale(locale) ? locale : "uk";
}

/** First value of a search param (Next gives string | string[] | undefined). */
export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
