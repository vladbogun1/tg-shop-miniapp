import type { Locale } from "@shop/core/i18n";

export interface LegalDoc {
  title: string | null;
  updated: string | null;
  html: string;
  /** The language the text is actually in: the requested one, or "uk" when it is not translated. */
  contentLocale: Locale;
}
