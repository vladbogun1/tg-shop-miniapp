/**
 * Данные, не тексты интерфейса: продавец (юр. лицо) и город для разметки schema.org.
 * Живут в `*.data.ts` — правило cyrillic-literal такие файлы не считает.
 */
import { type Locale } from "@shop/core/i18n";

export const SELLER = {
  name: "ФОП Солоха Максим Андрійович",
  taxId: "3547612413",
};

/** Город продавца по языку страницы — для PostalAddress в JSON-LD. */
export const SELLER_LOCALITY: Record<Locale, string> = { uk: "Харків", ru: "Харьков", en: "Kharkiv" };
