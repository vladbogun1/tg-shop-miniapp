/**
 * Журнал карточки товара (`products.card_meta`): уверенность ИИ по полям, источники и «что изменил последний импорт».
 * В OpenAPI это произвольный объект, поэтому форма описана здесь; лежит в catalog — её читают и форма
 * характеристик (catalog), и «Карточки» (cards), и товар (product), а зависимости идут вверх по слоям.
 */

/** Card journal kept by the backend in products.card_meta. */
export interface CardMeta {
  fields?: Record<string, { c?: number; src?: string }>;
  sources?: string[];
  notes?: string;
  model?: string;
  overall?: number;
  importedAt?: string;
  reviewedAt?: string;
  /** Admin id — the review panel gets the name (CardReviewData.reviewedByName). */
  reviewedBy?: string | number;
  last?: CardLast;
}

/** One change of the last import: before → after (+ the AI's confidence / source of a characteristic). */
export interface CardChange<T = unknown> {
  before?: T | null;
  after?: T | null;
  c?: number;
  src?: string;
  /** The admin changed it in the review panel after the import. */
  edited?: boolean;
}

/**
 * card_meta.last — what the LAST AI import changed (replaced by every import; the admin's edits
 * from the review panel are merged into it). Text keys are "lang/field": "ru/title", "uk/description".
 */
export interface CardLast {
  at?: string;
  editedAt?: string;
  model?: string;
  changed?: {
    category?: CardChange<string>;
    brand?: CardChange<string>;
    specs?: Record<string, CardChange>;
    texts?: Record<string, CardChange<string>>;
  };
}
