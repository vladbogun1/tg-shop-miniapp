/** «Поставка с ИИ»: что ИИ прочитал из документа и во что админка это превратила. Чистые типы. */

/** Одна строка документа, как её прочитал ИИ (шаг 1). Деньги — в единицах валюты документа, не в minor. */
export interface SourceLine {
  /** "L1", "L2"… — номер строки в ответе, по нему отвечает шаг 2. */
  id: string;
  /** Текст строки как в документе (с иероглифами) — ключ памяти поставщика. */
  text: string;
  /** Вариант / цвет / размер строки, как в документе. */
  variant: string | null;
  /** Перевод на английский, если документ не на латинице. */
  en: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
  qty: number;
  unitPrice: number | null;
  lineTotal: number | null;
  notes: string | null;
}

export interface ExtractedDoc {
  supplier: string | null;
  currency: string | null;
  /** Номер документа / заказа — пойдёт в заметку поставки. */
  docNo: string | null;
  docDate: string | null;
  /** Итог документа (за товары), если он в документе есть. */
  total: number | null;
  lines: SourceLine[];
}

/** Товар каталога, как его видит сопоставление. */
export interface CatalogItem {
  id: string;
  title: string;
  brand: string | null;
  categoryId: string | null;
  variants: { id: string; name: string }[];
  imageUrl: string | null;
}

/** Предложение «завести новый товар» — от ИИ (шаг 2) или пустое, если админ выбрал «новый» сам. */
export interface NewProductDraft {
  title: string;
  brand: string | null;
  categoryId: string | null;
  /** Название варианта; строки с одинаковым title станут одним товаром с вариантами. */
  variant: string | null;
  source: string | null;
}

/** Решение по строке: наш товар, новый товар, пропустить или ещё не решено. */
export type LineDecision =
  | { kind: "match"; productId: string; variantId: string | null; by: "memory" | "search" | "ai" | "admin" }
  | { kind: "new"; draft: NewProductDraft }
  | { kind: "skip" }
  | { kind: "open" };

export interface Candidate {
  productId: string;
  variantId: string | null;
  score: number;
}

export interface ReviewRow {
  line: SourceLine;
  decision: LineDecision;
  /** Лучшие кандидаты поиска — для подсказки и для шага 2. */
  candidates: Candidate[];
}
