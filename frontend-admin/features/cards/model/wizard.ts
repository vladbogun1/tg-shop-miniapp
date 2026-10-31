/**
 * «Оформить с ИИ» (пакетный мастер): порядок и поиск товаров, что не вернулось в ответе, быстрые отметки
 * «Только ≥ 80 %» и т.п., итоги проверки и сохранения. Чистая логика (экран — `ui/wizard`).
 */
import type { CardItem } from "./item";
import { categoryPathName, type CardSchema } from "./schema";
import { defaultSel, type ProductSel } from "./selection";
import type { Level, ProductReview } from "./types";

const REASON_RU: Record<string, string> = {
  NOT_FOUND: "товар не найден",
  PRODUCT_NOT_FOUND: "товар не найден",
  UNKNOWN_CATEGORY: "нет такой категории",
  CATEGORY_NOT_FOUND: "нет такой категории",
  CATEGORY_NOT_LEAF: "категория не лист",
  NOT_LEAF: "категория не лист",
  UNKNOWN_KEY: "нет такого ключа в схеме",
  UNKNOWN_OPTION: "нет такой опции",
  NOT_A_NUMBER: "не число",
  OUT_OF_RANGE: "число вне допустимого",
  MIN_GT_MAX: "min больше max",
  EMPTY: "пустое значение",
  INVALID: "некорректное значение",
  NOTHING_TO_APPLY: "нечего применять",
};

/** Код отказа сервера по-русски (неизвестный — как есть). */
export const reasonRu = (r: string): string => REASON_RU[r] ?? REASON_RU[r?.toUpperCase?.()] ?? r;

/** Товары по категории и названию (без категории — в конце). */
export function sortForWizard(items: CardItem[], schema: CardSchema): CardItem[] {
  const key = new Map(items.map((it) => [it.id, `${categoryPathName(schema, it.categorySlug) || "я"}\u0000${it.title}`]));
  return [...items].sort((a, b) => key.get(a.id)!.localeCompare(key.get(b.id)!, "ru"));
}

/** Сначала отмеченные (порядок фиксируется на момент открытия списка, чтобы строка не убегала из-под курсора). */
export function chosenFirst(list: CardItem[], chosen: ReadonlySet<string>): CardItem[] {
  return [...list.filter((i) => chosen.has(i.id)), ...list.filter((i) => !chosen.has(i.id))];
}

/** Номера товаров из отправленных пакетов, на которые в ответе нет записи (пакет без единого ответа не считается отправленным). */
export function missingFromAnswer(batchPids: string[][], answered: ReadonlySet<string>): string[] {
  const missing: string[] = [];
  for (const pids of batchPids) if (pids.some((p) => answered.has(p))) missing.push(...pids.filter((p) => !answered.has(p)));
  return missing;
}

export type BulkKind = "80" | "okwarn" | "none";

/** Быстрая отметка для одной карточки: «Только ≥ 80 %», «Все зелёные и жёлтые», «Снять все». */
export function bulkSelection(kind: BulkKind, r: ProductReview, current: ProductSel | undefined): ProductSel {
  const def = defaultSel(r);
  if (kind === "none") return { ...(current ?? def), on: false };
  if (kind === "okwarn") return def;
  return {
    ...def,
    on: r.level !== "error" && (r.overall ?? 0) >= 80,
    fields: new Set(r.fields.filter((f) => f.value !== undefined && f.level !== "error" && (f.confidence ?? 0) >= 80).map((f) => f.key)),
  };
}

export function levelCounts(reviews: ProductReview[]): Record<Level, number> {
  const count = (l: Level) => reviews.filter((x) => x.level === l).length;
  return { ok: count("ok"), warn: count("warn"), error: count("error") };
}

/** Сколько переводов (uk, en) и пропущенных ручных вернул сервер по всем товарам. */
export function translationTotals(items: { translated?: { uk?: number; en?: number } | null; skippedManual?: number | null }[]) {
  return items.reduce((acc, x) => ({ uk: acc.uk + (x.translated?.uk ?? 0), en: acc.en + (x.translated?.en ?? 0), manual: acc.manual + (x.skippedManual ?? 0) }), {
    uk: 0,
    en: 0,
    manual: 0,
  });
}
