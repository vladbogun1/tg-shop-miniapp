/**
 * «Заменить характеристики целиком» в проверке ответа ИИ: характеристики карточки становятся набором из ответа.
 * Что ИИ назвал и человек отметил — новым значением; что ИИ назвал, но не отмечено, — прежним значением карточки;
 * чего в ответе нет вовсе — удаляется (импорт с `replaceSpecs: true`). Список удаляемого показываем до записи.
 * Чистая логика.
 */
import { attributesForCategory, type CardSchema } from "./schema";
import type { ProductReview } from "./types";
import type { CardImportItem } from "./wire";

export interface RemovedSpec {
  key: string;
  label: string;
}

const filled = (v: unknown) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);

function currentSpecs(r: ProductReview): [string, unknown][] {
  return Object.entries(r.item.specs ?? {}).filter(([, v]) => filled(v));
}

const inAnswer = (r: ProductReview) => new Set(r.fields.map((f) => f.key));

/** Заполненные характеристики карточки, которых нет в ответе: при замене целиком они будут удалены. */
export function removedByReplace(r: ProductReview, schema: CardSchema | undefined): RemovedSpec[] {
  const keys = inAnswer(r);
  const attrs = schema ? attributesForCategory(schema, r.targetCategory ?? r.item.categorySlug) : [];
  return currentSpecs(r)
    .filter(([k]) => !keys.has(k))
    .map(([k]) => ({ key: k, label: attrs.find((a) => a.key === k)?.labelRu ?? k }));
}

/** Характеристики для импорта с заменой: прежние значения ключей из ответа и поверх них — принятые новые. */
export function withReplacedSpecs(r: ProductReview, chosen: Record<string, unknown>): Record<string, unknown> {
  const keys = inAnswer(r);
  const kept = Object.fromEntries(currentSpecs(r).filter(([k]) => keys.has(k)));
  return { ...kept, ...chosen };
}

/**
 * Запись с заменой: характеристики записи — набор из ответа. Если, кроме удаления, писать нечего (ничего не отмечено),
 * — запись одних характеристик; удалять тоже нечего — записи нет.
 */
export function replacingImport(r: ProductReview, item: CardImportItem | null): CardImportItem | null {
  if (item) return { ...item, specs: withReplacedSpecs(r, item.specs) };
  if (removedByReplace(r, undefined).length === 0) return null;
  return { productId: r.item.id, specs: withReplacedSpecs(r, {}), confidence: {}, markReady: false };
}
