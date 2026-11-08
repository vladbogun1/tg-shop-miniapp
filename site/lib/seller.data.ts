/**
 * Данные, не тексты интерфейса: продавец (юр. лицо) и город для разметки schema.org.
 * Живут в `*.data.ts` — правило cyrillic-literal такие файлы не считает.
 */
import { type Locale } from "@shop/core/i18n";

export const SELLER = {
  name: "ФОП Солоха Максим Андрійович",
  taxId: "3547612413",
  /** Phone and e-mail of the shop: the contacts page, the footer and the store JSON-LD (Google Merchant wants them on the site). */
  phone: "+380732951737",
  phoneDisplay: "+380 73 295 17 37",
  email: "chisetup.com.ua@gmail.com",
};

/** Улица точки самовывоза (как в Google Merchant Center и профиле компании): «Контакты» и PostalAddress. */
export const SELLER_STREET: Record<Locale, string> = { uk: "вул. Байрона, 167г", ru: "ул. Байрона, 167г", en: "167H Bairona St" };
export const SELLER_POSTAL_CODE = "61000";

/** Город продавца по языку страницы — для PostalAddress в JSON-LD. */
export const SELLER_LOCALITY: Record<Locale, string> = { uk: "Харків", ru: "Харьков", en: "Kharkiv" };
