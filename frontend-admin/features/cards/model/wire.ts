/**
 * «Карточки»: тела запросов записи (импорт ответа ИИ, принятие карточки, опции характеристики) — то, что собирает интерфейс.
 * Проверяются на совместимость со сгенерированными схемами OpenAPI в `api.ts`.
 */

export interface CardImportItem {
  productId: string;
  categorySlug?: string;
  brand?: string;
  specs: Record<string, unknown>;
  confidence: Record<string, number>;
  overall?: number;
  description?: string;
  sources?: string[];
  notes?: string;
  model?: string;
  markReady: boolean;
  /** Put the product on the storefront (active=true) when the card can be shown. */
  publish?: boolean;
  /** New Russian title (only when the rename is accepted). */
  title?: string;
  /** uk/en of the FINAL Russian texts (title, description, condition note). */
  translations?: Partial<Record<"uk" | "en", CardTextTranslations>>;
  /** Source url per characteristic, when the AI named one (card_meta.fields[key].src). */
  fieldSources?: Record<string, string>;
}

export interface CardTextTranslations {
  title?: string;
  description?: string;
  conditionNote?: string;
}

export interface CardImportRequest {
  items: CardImportItem[];
  replaceSpecs: boolean;
}

/** PUT /api/admin/cards/{id}/accept — the admin's edits (all optional) + READY. */
export interface CardAcceptBody {
  title?: string;
  description?: string;
  specs?: Record<string, unknown>;
  translations?: Partial<Record<"uk" | "en", CardTextTranslations>>;
  /** false = save the edits but keep the status. Default true. */
  ready?: boolean;
}

/** Option as PATCH /api/admin/spec-attributes/{id} takes it (the list replaces the old one). */
export interface SpecOptionWrite {
  value: string;
  labelRu: string;
  labelUk: string;
  labelEn: string;
  aliases?: string;
}
