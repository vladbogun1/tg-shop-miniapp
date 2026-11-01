/**
 * «Карточки»: журнал карточки (`products.card_meta` — в OpenAPI это произвольный объект, поэтому форма описана здесь)
 * и ответ панели проверки. Чистые типы.
 */
import type { CardItem } from "./item";
import type { TextField } from "./types";


export type { CardChange, CardLast, CardMeta } from "@/features/catalog";
import type { CardLast } from "@/features/catalog";
import { type TranslatedLocale } from "@shop/core/i18n";

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
  translations: Record<TranslatedLocale, Partial<Record<TextField, CardTextState>>>;
}
