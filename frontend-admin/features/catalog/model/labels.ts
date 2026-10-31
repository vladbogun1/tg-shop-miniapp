/** Подписи справочника: состояние товара, статус карточки, тип характеристики, картинки плиток сайта. */
import type { CardStatus, ProductCondition, SpecType } from "@shop/core/catalog";

export const CONDITION_OPTIONS: { value: ProductCondition; label: string }[] = [
  { value: "NEW", label: "Новый" },
  { value: "MARKDOWN", label: "Уценка" },
  { value: "USED", label: "Б/у" },
];
export const CONDITION_LABEL: Record<ProductCondition, string> = { NEW: "Новый", MARKDOWN: "Уценка", USED: "Б/у" };

export const CARD_STATUS_LABEL: Record<CardStatus, string> = {
  DRAFT: "Черновик",
  AI_FILLED: "От ИИ",
  READY: "Проверена",
};

export const SPEC_TYPE_LABEL: Record<SpecType, string> = {
  number: "Число",
  enum: "Выбор одного",
  multi: "Выбор нескольких",
  bool: "Да / нет",
  text: "Текст",
};

/** Tile pictures of the site (site/ mascot art) — `null` = «авто» (guessed from the slug). */
export const ART_KINDS: { value: string; label: string }[] = [
  { value: "mouse", label: "Мышь" },
  { value: "keyboard", label: "Клавиатура" },
  { value: "keycaps", label: "Кейкапы" },
  { value: "pad", label: "Коврик" },
  { value: "glass", label: "Стеклянный коврик" },
  { value: "glides", label: "Глайды" },
  { value: "headphones", label: "Наушники" },
  { value: "iem", label: "Внутриканальные (IEM)" },
  { value: "soundcard", label: "Звуковая карта" },
  { value: "sleeve", label: "Чехол / кейс" },
  { value: "cable", label: "Кабель" },
  { value: "blower", label: "Дуйка" },
  { value: "chair", label: "Кресло" },
  { value: "desk", label: "Стол" },
  { value: "sale", label: "Распродажа / уценка" },
];

/** Confidence dot colour: green ≥ 80, yellow 60–79, red < 60. */
export function confidenceColor(c: number): string {
  return c >= 80 ? "var(--ok)" : c >= 60 ? "var(--warn)" : "var(--danger)";
}
