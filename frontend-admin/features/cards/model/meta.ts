/**
 * «Карточки»: журнал карточки (`products.card_meta` — в OpenAPI это произвольный объект, поэтому форма описана здесь)
 * и ответ панели проверки. Чистые типы.
 */
import type { CardItem } from "./item";
import type { TextField } from "./types";


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

export interface CardTextState {
  text: string;
  origin: "AI" | "MANUAL";
  /** Made for another Russian text (the site shows Russian until it is re-translated). */
  stale: boolean;
}

/** GET /api/admin/cards/{id}/review — everything the review panel shows. */
export interface CardReviewData {
  item: CardItem;
  last: CardLast | null;
  importedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: number | null;
  reviewedByName: string | null;
  translations: Record<"uk" | "en", Partial<Record<TextField, CardTextState>>>;
}
