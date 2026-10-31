import type { CardStatus, ProductCondition, ProductSpecs } from "@shop/core/catalog";
import type { ProductVariant } from "@shop/core/types";
import { toMajor, toMinor } from "@/lib/money";
import type { BrandValue } from "@/features/catalog";
import { S } from "./steps";
import type { AdminProduct, ProductWriteRequest } from "./types";

/** Редактируемая форма товара простыми значениями — тот же вид снимается, чтобы увидеть несохранённые правки. */
export interface ProductForm {
  title: string;
  description: string;
  priceMajor: string;
  stock: string;
  active: boolean;
  slug: string;
  compareAtMajor: string;
  seoTitle: string;
  seoDescription: string;
  sku: string;
  categoryId: string;
  brand: BrandValue;
  condition: ProductCondition;
  conditionNote: string;
  specs: ProductSpecs;
  variants: ProductVariant[];
  imageKeys: string[];
}

/** Валюта только гривна: свободное поле пропускало опечатки («UHA»). */
export const CURRENCY = "UAH";

const imageKeysOf = (product: AdminProduct | null): string[] =>
  (product?.images ?? [])
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((i) => i.url ?? "")
    .filter(Boolean);

function textFields(p: AdminProduct | null) {
  return {
    title: p?.title ?? "",
    description: p?.description ?? "",
    slug: p?.slug ?? "",
    seoTitle: p?.seoTitle ?? "",
    seoDescription: p?.seoDescription ?? "",
    sku: p?.sku ?? "",
    conditionNote: p?.conditionNote ?? "",
  };
}

function priceStockFields(p: AdminProduct | null) {
  return {
    priceMajor: p && p.priceMinor > 0 ? String(toMajor(p.priceMinor)) : "",
    stock: String(p?.stock ?? 0),
    active: p?.active ?? false,
    compareAtMajor: p?.compareAtMinor ? String(toMajor(p.compareAtMinor)) : "",
  };
}

function catalogFields(p: AdminProduct | null) {
  return {
    categoryId: p?.categoryId ?? "",
    brand: { id: p?.brandRef?.id ?? null, name: p?.brandRef?.name ?? "" },
    condition: p?.condition ?? "NEW",
    specs: p?.specs ?? {},
  };
}

export function initialForm(product: AdminProduct | null): ProductForm {
  return {
    ...textFields(product),
    ...priceStockFields(product),
    ...catalogFields(product),
    // Id остаётся: по нему сервер понимает «это тот же вариант», и переименование правит строку, а не удаляет
    // её с новым UUID (это ломало сохранённые корзины покупателей и ссылку на вариант в прошлых заказах).
    variants: product?.variants?.map((v) => ({ id: v.id, name: v.name, stock: v.stock })) ?? [],
    imageKeys: imageKeysOf(product),
  };
}

export function initialCardStatus(product: AdminProduct | null): CardStatus {
  return product?.cardStatus ?? "DRAFT";
}

// ---- остатки: с чем открыли форму -------------------------------------------------------------

/** Остатки на момент открытия формы: правка шлёт их как `expectedStock`, сервер сверяет (409 при расхождении). */
export interface StockBase {
  stock: number;
  variants: Record<string, number>;
}

export function stockBaseOf(f: ProductForm): StockBase {
  return {
    stock: Number(f.stock) || 0,
    variants: Object.fromEntries(f.variants.filter((v) => v.id).map((v) => [v.id as string, Number(v.stock) || 0])),
  };
}

export const hasVariants = (f: ProductForm): boolean => f.variants.length > 0;

export function effectiveStockOf(f: ProductForm): number {
  return hasVariants(f) ? f.variants.reduce((a, v) => a + (Number(v.stock) || 0), 0) : Number(f.stock) || 0;
}

export const priceMinorOf = (f: ProductForm): number => (f.priceMajor.trim() ? toMinor(f.priceMajor) : 0);
export const compareAtMinorOf = (f: ProductForm): number => (f.compareAtMajor.trim() ? toMinor(f.compareAtMajor) : 0);

/** Сколько штук форма снимает с полки против открытого состояния (0 — ничего). */
export function stockDrop(f: ProductForm, base: StockBase): number {
  if (!hasVariants(f)) return Math.max(0, base.stock - (Number(f.stock) || 0));
  return f.variants.reduce((sum, v) => {
    const was = v.id ? base.variants[v.id] : undefined;
    return was === undefined ? sum : sum + Math.max(0, was - (Number(v.stock) || 0));
  }, 0);
}

/** Строки (id варианта или null для товара без вариантов), у которых форма поднимает остаток. */
export function stockRaises(f: ProductForm, base: StockBase): (string | null)[] {
  if (!hasVariants(f)) return (Number(f.stock) || 0) > base.stock ? [null] : [];
  return f.variants.flatMap((v) => {
    const was = v.id ? base.variants[v.id] : undefined;
    return v.id && was !== undefined && (Number(v.stock) || 0) > was ? [v.id] : [];
  });
}

// ---- тела запросов ----------------------------------------------------------------------------

function brandFields(f: ProductForm, onEmpty: { brandId: string } | Record<string, never>) {
  if (f.brand.id) return { brandId: f.brand.id };
  return f.brand.name.trim() ? { brandName: f.brand.name.trim() } : onEmpty;
}

export interface EditBodyCtx {
  base: StockBase;
  /** Ключи характеристик категории; null — отдавать характеристики как есть. */
  attrKeys: ReadonlySet<string> | null;
  /** Причина уменьшения остатка (спрашивается при сохранении). */
  stockReason: { reason: string; note?: string } | null;
}

function editVariants(f: ProductForm, base: StockBase): ProductWriteRequest["variants"] {
  return f.variants
    .filter((v) => v.name.trim())
    .map((v) => {
      const n = Number(v.stock) || 0;
      const was = v.id ? base.variants[v.id] : undefined;
      if (was === undefined) return { id: v.id, name: v.name.trim(), stock: n };
      return n === was ? { id: v.id, name: v.name.trim() } : { id: v.id, name: v.name.trim(), stock: n, expectedStock: was };
    });
}

/** Тело правки товара. Остаток уходит только если админ его менял — вместе со значением, с которым открыли форму. */
export function editBody(f: ProductForm, ctx: EditBodyCtx, overrides: Partial<ProductWriteRequest> = {}): ProductWriteRequest {
  const stockChanged = !hasVariants(f) && (Number(f.stock) || 0) !== ctx.base.stock;
  // Уходят только ключи схемы категории (остальные сервер всё равно отбросит).
  const attrKeys = ctx.attrKeys;
  const specs = attrKeys ? Object.fromEntries(Object.entries(f.specs).filter(([k]) => attrKeys.has(k))) : f.specs;
  return {
    title: f.title.trim(),
    description: f.description.trim() || undefined,
    priceMinor: priceMinorOf(f),
    currency: CURRENCY,
    ...(stockChanged ? { stock: Number(f.stock) || 0, expectedStock: ctx.base.stock } : {}),
    active: f.active,
    imageKeys: f.imageKeys,
    variants: editVariants(f, ctx.base),
    // Пустой slug — сервер сделает из названия (и сделает уникальным).
    slug: f.slug.trim(),
    compareAtMinor: compareAtMinorOf(f),
    seoTitle: f.seoTitle.trim(),
    seoDescription: f.seoDescription.trim(),
    sku: f.sku.trim(),
    // "" очищает (null оставил бы сохранённое).
    categoryId: f.categoryId,
    ...brandFields(f, { brandId: "" }),
    condition: f.condition,
    conditionNote: f.condition === "NEW" ? "" : f.conditionNote.trim(),
    specs,
    ...(ctx.stockReason ? { stockReason: ctx.stockReason.reason, stockNote: ctx.stockReason.note } : {}),
    ...overrides,
  };
}

/** Тело создания: короткая форма, товар сохраняется скрытым черновиком. */
export function createBody(f: ProductForm): ProductWriteRequest {
  return {
    title: f.title.trim(),
    priceMinor: priceMinorOf(f),
    currency: CURRENCY,
    stock: effectiveStockOf(f),
    active: false,
    imageKeys: f.imageKeys,
    variants: f.variants.filter((v) => v.name.trim()).map((v) => ({ name: v.name.trim(), stock: Number(v.stock) || 0 })),
    categoryId: f.categoryId,
    ...brandFields(f, {}),
  };
}

// ---- проверки ---------------------------------------------------------------------------------

export interface CreateErrors {
  title?: string;
  category?: string;
  price?: string;
  stock?: string;
  variants?: string;
}

export function createErrors(f: ProductForm, categoryIsLeaf: boolean): CreateErrors {
  return {
    title: !f.title.trim() ? "Укажите название" : undefined,
    category: !f.categoryId ? "Выберите категорию" : !categoryIsLeaf ? "Выберите подкатегорию" : undefined,
    price: priceMinorOf(f) <= 0 ? "Укажите цену больше 0" : undefined,
    stock: !hasVariants(f) && f.stock.trim() === "" ? "Укажите остаток" : undefined,
    variants: f.variants.some((v) => !v.name.trim()) ? "У варианта нет названия" : undefined,
  };
}

/** Первая ошибка создания (по порядку полей) или undefined. */
export function firstCreateError(errors: CreateErrors): string | undefined {
  return Object.values(errors).find(Boolean);
}

/** «Старая цена» должна быть больше текущей. */
export function isCompareAtInvalid(f: ProductForm): boolean {
  const compareAt = compareAtMinorOf(f);
  return compareAt > 0 && compareAt <= priceMinorOf(f);
}

/** Валидность шага — решает, пускает ли «Далее» (шапка шагов всё равно позволяет перепрыгнуть). */
export function stepValid(step: number, f: ProductForm, categoryIsLeaf: boolean): boolean {
  if (step === S.basics) return f.title.trim().length > 0;
  if (step === S.pricing) return !isCompareAtInvalid(f) && !(f.active && priceMinorOf(f) <= 0);
  if (step === S.category) return categoryIsLeaf;
  return true;
}

/** Текст ошибки шага, на котором «Далее» не пускает; undefined — шаг без текста. */
export function stepError(step: number, f: ProductForm): string | undefined {
  if (step === S.basics) return "Укажите название";
  if (step === S.pricing) return isCompareAtInvalid(f) ? "Старая цена должна быть больше текущей" : "Товару на витрине нужна цена больше 0";
  if (step === S.category) return "Выберите категорию без подкатегорий";
  return undefined;
}

// ---- переводы, которые сбросит правка русского --------------------------------------------------

/** Поля content_translations, русский источник которых форма может изменить. */
const PRODUCT_TR_FIELDS: readonly string[] = ["title", "description", "seo_title", "seo_description", "condition_note"];

export interface TranslatedText {
  entityType: string;
  entityId: string;
  field: string;
}

function changedTextFields(f: ProductForm, product: AdminProduct): Set<string> {
  const changed = new Set<string>();
  const differs = (a: string, b: string | null | undefined) => a.trim() !== (b ?? "").trim();
  if (differs(f.title, product.title)) changed.add("title");
  if (differs(f.description, product.description)) changed.add("description");
  if (differs(f.seoTitle, product.seoTitle)) changed.add("seo_title");
  if (differs(f.seoDescription, product.seoDescription)) changed.add("seo_description");
  if (differs(f.conditionNote, product.conditionNote)) changed.add("condition_note");
  return changed;
}

/** Переведённые тексты uk/en, которые сбросит правка русского (на сайте снова будет русский, пока не переведут заново). */
export function countStaleTranslations(f: ProductForm, product: AdminProduct, translated: TranslatedText[]): number {
  const changed = changedTextFields(f, product);
  const renamedVariants = new Set(
    f.variants
      .filter((v) => {
        const before = product.variants?.find((o) => o.id && o.id === v.id);
        return before && before.name.trim() !== v.name.trim();
      })
      .map((v) => v.id as string)
  );
  return translated.filter(
    (t) =>
      (t.entityType === "PRODUCT" && t.entityId === product.id && PRODUCT_TR_FIELDS.includes(t.field) && changed.has(t.field)) ||
      (t.entityType === "VARIANT" && renamedVariants.has(t.entityId))
  ).length;
}
