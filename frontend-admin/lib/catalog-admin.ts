/**
 * Catalog v2 helpers of the admin (docs/CATALOG-SPECS.md §5): the category tree, attribute
 * inheritance, "missing required" check, labels of conditions / card statuses / tile art.
 * The storefront logic (filters, facets) lives in `@shop/shared` (catalog.ts).
 */
import type { CardStatus, ProductCondition, ProductSpecs, SpecType, SpecValue } from "@shop/shared";
import type { AdminCategory, AdminProduct, AdminSpecAttribute, AdminSpecGroup } from "@/lib/api";
import { slugify } from "@/lib/slug";

// ---- labels ---------------------------------------------------------------------------

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

// ---- tree ------------------------------------------------------------------------------

export function byOrder(a: AdminCategory, b: AdminCategory): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru");
}

export function childrenOf(cats: AdminCategory[], parentId: string | null): AdminCategory[] {
  return cats.filter((c) => (c.parentId ?? null) === parentId).sort(byOrder);
}

export interface TreeNode {
  cat: AdminCategory;
  children: AdminCategory[];
}

/** Roots in menu order, each with its children; orphans (parent missing) count as roots. */
export function buildTree(cats: AdminCategory[]): TreeNode[] {
  const ids = new Set(cats.map((c) => c.id));
  return cats
    .filter((c) => !c.parentId || !ids.has(c.parentId))
    .sort(byOrder)
    .map((cat) => ({ cat, children: childrenOf(cats, cat.id) }));
}

export function categoryPathOf(cats: AdminCategory[], id: string | null | undefined): AdminCategory[] {
  const out: AdminCategory[] = [];
  let c = id ? cats.find((x) => x.id === id) : undefined;
  for (let guard = 0; c && guard < 10; guard++) {
    out.unshift(c);
    const pid = c.parentId;
    c = pid ? cats.find((x) => x.id === pid) : undefined;
  }
  return out;
}

export function pathLabel(cats: AdminCategory[], id: string | null | undefined): string {
  return categoryPathOf(cats, id)
    .map((c) => c.name)
    .join(" › ");
}

export function isLeaf(cats: AdminCategory[], id: string): boolean {
  return !cats.some((c) => c.parentId === id);
}

export function subtreeOf(cats: AdminCategory[], id: string): Set<string> {
  const out = new Set([id]);
  for (const c of cats) if (c.parentId === id) out.add(c.id);
  return out;
}

// ---- attributes --------------------------------------------------------------------------

/** Global → root → … → the category itself, each level by sort. */
export function attributesForCategory(
  attrs: AdminSpecAttribute[],
  cats: AdminCategory[],
  categoryId: string | null | undefined
): AdminSpecAttribute[] {
  const path = categoryPathOf(cats, categoryId).map((c) => c.id);
  const rank = new Map<string | null, number>([[null, 0]]);
  path.forEach((id, i) => rank.set(id, i + 1));
  return attrs
    .filter((a) => rank.has(a.categoryId ?? null))
    .sort((a, b) => rank.get(a.categoryId ?? null)! - rank.get(b.categoryId ?? null)! || a.sortOrder - b.sortOrder);
}

/** Attributes grouped in group order; unknown groups at the end under their key. */
export function groupAttributes<T extends { group: string }>(
  attrs: T[],
  groups: AdminSpecGroup[]
): { key: string; label: string; items: T[] }[] {
  const order = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
  const out: { key: string; label: string; items: T[] }[] = [];
  for (const g of order) {
    const items = attrs.filter((a) => a.group === g.key);
    if (items.length) out.push({ key: g.key, label: g.labelRu || g.key, items });
  }
  const known = new Set(order.map((g) => g.key));
  const rest = [...new Set(attrs.map((a) => a.group).filter((k) => !known.has(k)))];
  for (const k of rest) out.push({ key: k, label: k, items: attrs.filter((a) => a.group === k) });
  return out;
}

export function isSpecEmpty(v: SpecValue | undefined | null): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export function missingRequiredKeys(attrs: AdminSpecAttribute[], specs: ProductSpecs | null | undefined): string[] {
  return attrs.filter((a) => a.required && isSpecEmpty(specs?.[a.key])).map((a) => a.key);
}

/** Missing required keys of a product: the backend's answer when present, else computed here. */
export function productMissingRequired(
  p: AdminProduct,
  attrs: AdminSpecAttribute[],
  cats: AdminCategory[]
): string[] {
  if (Array.isArray(p.missingRequired)) return p.missingRequired;
  if (!p.categoryId) return [];
  return missingRequiredKeys(attributesForCategory(attrs, cats, p.categoryId), p.specs);
}

/** Short human text of a value («51 г», «50–30 000 DPI», «Да», «PAW3950, PAW3395»). */
export function formatAdminSpec(a: AdminSpecAttribute, v: SpecValue | undefined): string | null {
  if (isSpecEmpty(v)) return null;
  const unit = a.unitRu ? ` ${a.unitRu}` : "";
  const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
  switch (a.type) {
    case "number":
      if (typeof v === "number") return nf.format(v) + unit;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        return v.min === v.max ? nf.format(v.min) + unit : `${nf.format(v.min)}–${nf.format(v.max)}${unit}`;
      }
      return null;
    case "enum":
      return a.options.find((o) => o.value === v)?.labelRu ?? String(v);
    case "multi":
      return Array.isArray(v) ? v.map((x) => a.options.find((o) => o.value === x)?.labelRu ?? x).join(", ") : null;
    case "bool":
      return v === true ? "Да" : v === false ? "Нет" : null;
    default:
      return typeof v === "string" ? v : null;
  }
}

/** Confidence dot colour: green ≥ 80, yellow 60–79, red < 60. */
export function confidenceColor(c: number): string {
  return c >= 80 ? "var(--ok)" : c >= 60 ? "var(--warn)" : "var(--danger)";
}

// ---- keys / slugs ---------------------------------------------------------------------------

/** snake_case latin key from a Russian label: «Вес» → ves, «Частота опроса» → chastota_oprosa. */
export function keyFromLabel(label: string): string {
  return slugify(label).replace(/-/g, "_").replace(/^(\d)/, "_$1").slice(0, 48);
}

export function isValidKey(key: string): boolean {
  return /^[a-z][a-z0-9_]{0,47}$/.test(key);
}

/** Option value slug: lower latin, digits, underscore. */
export function optionValueFrom(label: string): string {
  return slugify(label).replace(/-/g, "_").slice(0, 64);
}

// ---- words ------------------------------------------------------------------------------------

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const productsWord = (n: number) => `${n} ${plural(n, "товар", "товара", "товаров")}`;
