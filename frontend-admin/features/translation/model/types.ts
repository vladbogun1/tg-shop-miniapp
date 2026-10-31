/**
 * Типы предметной области «Переводов». Ответы API — алиасы сгенерированных схем (см. `../api.ts`);
 * здесь — то, что приложение уточняет сверх OpenAPI (перечисления вместо `string`, null вместо «поля нет»)
 * и тела запросов.
 */
import type { Schemas } from "@shop/core/api/schemas";

export type TrLocale = "uk" | "en";
export type TrEntityType = "PRODUCT" | "VARIANT" | "CATEGORY" | "PAYMENT_OPTION" | "REPLY_TEMPLATE" | "BOT_TEXT";
export type TrStatus = "TRANSLATED" | "STALE" | "MISSING";
export type TrOrigin = "AI" | "MANUAL";

/**
 * Одно переводимое поле одного языка (GET /api/admin/translations/export). В OpenAPI `entityType`,
 * `status` и `origin` — строки, а необязательные поля не помечены как null; здесь они сужены до того,
 * что отдаёт бэкенд (`origin`/`text`/`prevSource` — null у отсутствующего перевода).
 */
export type TrExportItem = Omit<
  Schemas["ExportItem"],
  "entityType" | "status" | "origin" | "text" | "productId" | "productTitle" | "prevSource"
> & {
  entityType: TrEntityType;
  status: TrStatus;
  /** Текущий перевод (устаревший — для STALE), null у MISSING. */
  text: string | null;
  origin: TrOrigin | null;
  /** Товар, которому принадлежит поле; у способов оплаты — null; у SEO-полей категории `productTitle` — её название. */
  productId: string | null;
  productTitle: string | null;
  /** STALE: русский текст, с которого сделан перевод (V56); null — неизвестен. */
  prevSource: string | null;
};

/** Сырой экспорт двух языков — из него экран собирает рабочий набор (`buildWorkSet`). */
export interface TrExportData {
  uk: TrExportItem[];
  en: TrExportItem[];
}

/** Тело /import: одно поле и текст для него. */
export interface TrImportItem {
  entityType: string;
  entityId: string;
  field: string;
  sourceHash: string;
  text: string;
}

/** Тело /accept: перевод верен для оригинала с `sourceHash` (должен быть текущим). */
export interface TrAcceptItem {
  entityType: string;
  entityId: string;
  field: string;
  locale: TrLocale;
  sourceHash: string;
}
