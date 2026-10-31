/** Характеристики категории: наследование, группировка, обязательные, короткий текст значения. */
import type { ProductSpecs, SpecType, SpecValue } from "@shop/core/catalog";
import { categoryPathOf } from "./tree";
import type { AdminCategory, AdminSpecAttribute, AdminSpecGroup } from "./types";

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
  p: { missingRequired?: string[] | null; categoryId?: string | null; specs?: ProductSpecs | null },
  attrs: AdminSpecAttribute[],
  cats: AdminCategory[]
): string[] {
  if (Array.isArray(p.missingRequired)) return p.missingRequired;
  if (!p.categoryId) return [];
  return missingRequiredKeys(attributesForCategory(attrs, cats, p.categoryId), p.specs);
}

function formatNumberSpec(v: SpecValue | undefined, unit: string): string | null {
  const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
  if (typeof v === "number") return nf.format(v) + unit;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v.min === v.max ? nf.format(v.min) + unit : `${nf.format(v.min)}–${nf.format(v.max)}${unit}`;
  }
  return null;
}

/** Short human text of a value («51 г», «50–30 000 DPI», «Да», «PAW3950, PAW3395»). */
export function formatAdminSpec(a: AdminSpecAttribute, v: SpecValue | undefined): string | null {
  if (isSpecEmpty(v)) return null;
  const unit = a.unitRu ? ` ${a.unitRu}` : "";
  switch (a.type) {
    case "number":
      return formatNumberSpec(v, unit);
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

const SPEC_TYPES: readonly SpecType[] = ["number", "enum", "multi", "bool", "text"];

/** Spec type from the backend (a string) -> a known type; anything unknown counts as text. */
export function asSpecType(v: string): SpecType {
  const t = v.toLowerCase() as SpecType;
  return SPEC_TYPES.includes(t) ? t : "text";
}
