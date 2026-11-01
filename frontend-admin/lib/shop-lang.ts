import type { Locale } from "@shop/core/i18n";

export type ShopLang = Locale;

/** Language names for the admin UI. */
export const LANG_LABEL: Record<ShopLang, string> = { uk: "Украинский", ru: "Русский", en: "Английский" };
export const LANG_SHORT: Record<string, string> = { uk: "UA", ru: "RU", en: "EN" };
