/** Ввод характеристик товара: сырой текст числовых полей и проверки, которые показывает форма. */
import type { ProductSpecs } from "@shop/core/catalog";
import { parseNum } from "./attribute-draft";
import type { AdminSpecAttribute } from "./types";

const numText = (n: number | undefined | null) => (n === undefined || n === null ? "" : String(n));

/** Raw text of number fields, so "12," or "-" can be typed without being rejected. */
export function rawFromSpecs(attrs: AdminSpecAttribute[], specs: ProductSpecs): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of attrs) {
    if (a.type !== "number") continue;
    const v = specs[a.key];
    if (typeof v === "number") {
      out[a.key] = numText(v);
      out[`${a.key}.min`] = numText(v);
      out[`${a.key}.max`] = numText(v);
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[`${a.key}.min`] = numText(v.min);
      out[`${a.key}.max`] = numText(v.max);
      out[a.key] = numText(v.min);
    }
  }
  return out;
}

/** Поле занимает обе колонки: «multi» и «enum» с 4–8 опциями (чипы). */
export function isWideField(a: AdminSpecAttribute): boolean {
  const n = a.options.length;
  return (a.type === "multi" || (a.type === "enum" && n <= 8 && n > 3)) && n > 0;
}

/** Диапазон с нечисловой границей или «от» больше «до». */
export function isRangeBad(a: AdminSpecAttribute, rawMin: string, rawMax: string): boolean {
  if (!a.range) return false;
  const min = parseNum(rawMin);
  const max = parseNum(rawMax);
  return Number.isNaN(min) || Number.isNaN(max) || (min ?? -Infinity) > (max ?? Infinity);
}

/** Одиночное число, введённое не числом. */
export function isNumberBad(a: AdminSpecAttribute, rawText: string): boolean {
  return a.type === "number" && !a.range && Number.isNaN(parseNum(rawText));
}
