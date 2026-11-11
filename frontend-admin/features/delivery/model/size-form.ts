/**
 * Вес и коробка товара / варианта / категории в форме: граммы и сантиметры строками.
 * Пустое поле = «наследовать»: вариант → товар → категория → родитель → настройки НП.
 */
import { cmText, intOrNull, intText, toMm } from "./format";
import type { ParcelSize, ProductSize } from "./types";

export interface SizeForm {
  weight: string;
  l: string;
  w: string;
  h: string;
}

export const EMPTY_SIZE: SizeForm = { weight: "", l: "", w: "", h: "" };

export function sizeToForm(s: ParcelSize | null | undefined): SizeForm {
  if (!s) return EMPTY_SIZE;
  return { weight: intText(s.weightG), l: cmText(s.lengthMm), w: cmText(s.widthMm), h: cmText(s.heightMm) };
}

export function sizeFromForm(f: SizeForm): ParcelSize {
  return { weightG: intOrNull(f.weight), lengthMm: toMm(f.l), widthMm: toMm(f.w), heightMm: toMm(f.h) };
}

/** Одинаковы ли размеры по смыслу ("10" и "10,0" — да). */
export function sameSize(a: SizeForm, b: SizeForm): boolean {
  const x = sizeFromForm(a);
  const y = sizeFromForm(b);
  return x.weightG === y.weightG && x.lengthMm === y.lengthMm && x.widthMm === y.widthMm && x.heightMm === y.heightMm;
}

/** Поле веса — только цифры; сантиметры — цифры и десятичный разделитель. */
export function cleanWeight(v: string): string {
  return v.replace(/[^\d]/g, "");
}
export function cleanCm(v: string): string {
  return v.replace(/[^\d.,]/g, "");
}

/** Формы товара и вариантов из ответа сервера. */
export interface ProductSizeForms {
  product: SizeForm;
  variants: Record<string, SizeForm>;
}

export function productForms(data: ProductSize): ProductSizeForms {
  return { product: sizeToForm(data.size), variants: Object.fromEntries(data.variants.map((v) => [v.id, sizeToForm(v.size)])) };
}

export function productSizeDirty(data: ProductSize, f: ProductSizeForms): boolean {
  if (!sameSize(f.product, sizeToForm(data.size))) return true;
  return data.variants.some((v) => !sameSize(f.variants[v.id] ?? EMPTY_SIZE, sizeToForm(v.size)));
}

export function productSizeBody(data: ProductSize, f: ProductSizeForms): ProductSize {
  return {
    ...data,
    size: sizeFromForm(f.product),
    variants: data.variants.map((v) => ({ ...v, size: sizeFromForm(f.variants[v.id] ?? EMPTY_SIZE) })),
  };
}

/** Глубина категории в дереве — для отступа в списке (не глубже 6, на случай петли). */
export function categoryDepth(c: { parentId?: string | null }, byId: Map<string, { parentId?: string | null }>): number {
  let d = 0;
  let p = c.parentId ? byId.get(c.parentId) : undefined;
  while (p && d < 6) {
    d++;
    p = p.parentId ? byId.get(p.parentId) : undefined;
  }
  return d;
}
