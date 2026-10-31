/**
 * Catalog v2 contract: category tree, brands, typed characteristics and the filter engine
 * shared by the Mini App and the website — see docs/CATALOG-SPECS.md.
 *
 * The backend stores and validates; filtering and facet counting live here, once, so the two
 * storefronts can never disagree about what "PAW3950 · до 55 г" matches. The catalog is small
 * (hundreds of products), so every storefront filters in memory over a full category list.
 */

import type { Schemas } from "./api/schemas";
import { parseRange } from "./catalog-url";
import { toMajor } from "./money";

export { filterForCategory, filterFromParams, filterToParams, parseRange, toggleFacet } from "./catalog-url";

// ---- schema ---------------------------------------------------------------------

export type SpecType = "number" | "enum" | "multi" | "bool" | "text";
export type ProductCondition = "NEW" | "MARKDOWN" | "USED";
export type CardStatus = "DRAFT" | "AI_FILLED" | "READY";

/** Reserved slug of the virtual "Уценка" collection (products with condition != NEW). */
export const MARKDOWN_COLLECTION_SLUG = "utsenka";

export type SpecOption = Schemas["SpecOptionDto"];

export type FacetBucket = Schemas["FacetBucketDto"];

export type SpecAttribute = Schemas["SpecAttributeDto"];

export type SpecGroup = Schemas["SpecGroupDto"];

export type CatalogCategory = Schemas["CatalogCategoryDto"];

/** How a brand logo is drawn on the dark site: recoloured to one tone, or as uploaded. */
export type BrandLogoMode = "MONO" | "ORIGINAL";

export type CatalogBrand = Schemas["CatalogBrandDto"];

export type CatalogSchema = Schemas["CatalogSchemaDto"];

// ---- product values ---------------------------------------------------------------

export type SpecValue = number | { min: number; max: number } | string | string[] | boolean;
/** products.specs — attribute key → value (see SpecType). Unknown = key absent. */
export type ProductSpecs = Record<string, SpecValue>;

export type ProductBrandRef = Schemas["BrandRefDto"];

/** Catalog fields every product DTO (Mini App, site, admin) carries since V52. */
export interface CatalogFields {
  categoryId?: string | null;
  brandRef?: ProductBrandRef | null;
  condition?: ProductCondition;
  /** Reason of the markdown / state of a used item, in the requested language. */
  conditionNote?: string | null;
  specs?: ProductSpecs;
}

// ---- tree helpers -------------------------------------------------------------------

export function categoryById(schema: Pick<CatalogSchema, "categories">, id: string | null | undefined) {
  return id ? schema.categories.find((c) => c.id === id) ?? null : null;
}

export function categoryBySlug(schema: Pick<CatalogSchema, "categories">, slug: string | null | undefined) {
  return slug ? schema.categories.find((c) => c.slug === slug) ?? null : null;
}

/** Root → … → category. */
export function categoryPath(schema: Pick<CatalogSchema, "categories">, id: string | null | undefined): CatalogCategory[] {
  const out: CatalogCategory[] = [];
  let c = categoryById(schema, id);
  for (let guard = 0; c && guard < 10; guard++) {
    out.unshift(c);
    c = categoryById(schema, c.parentId);
  }
  return out;
}

export function childCategories(schema: Pick<CatalogSchema, "categories">, parentId: string | null): CatalogCategory[] {
  return schema.categories
    .filter((c) => c.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** The category and all its descendants. */
export function subtreeIds(schema: Pick<CatalogSchema, "categories">, id: string): Set<string> {
  const ids = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of schema.categories) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id);
        grew = true;
      }
    }
  }
  return ids;
}

/**
 * Attributes that apply to a category: global → root → … → the category itself, by sort.
 * For a parent category (whose products sit in several leaves) only the attributes common to all
 * of them are filterable, which are exactly the ones defined on the parent path.
 */
export function attributesFor(schema: CatalogSchema, categoryId: string | null | undefined): SpecAttribute[] {
  const path = categoryPath(schema, categoryId).map((c) => c.id);
  const rank = new Map<string | null, number>([[null, 0]]);
  path.forEach((id, i) => rank.set(id, i + 1));
  return schema.attributes
    .filter((a) => rank.has(a.categoryId))
    .sort((a, b) => (rank.get(a.categoryId)! - rank.get(b.categoryId)!) || a.sort - b.sort);
}

// ---- formatting --------------------------------------------------------------------------

const nf = (locale: string) => new Intl.NumberFormat(locale === "en" ? "en-US" : locale === "ru" ? "ru-RU" : "uk-UA", { maximumFractionDigits: 3 });

/** "51 г", "50–30 000", "PAW3950", "Да". `yesNo` = [yes, no] in the UI language. */
export function formatSpec(attr: SpecAttribute, value: unknown, locale: string, yesNo: [string, string]): string | null {
  if (value === undefined || value === null) return null;
  const unit = attr.unit ? ` ${attr.unit}` : "";
  return SPEC_FORMATTERS[attr.type]?.({ attr, value, f: nf(locale), unit, yesNo });
}

interface SpecFormatArgs {
  attr: SpecAttribute;
  value: unknown;
  f: Intl.NumberFormat;
  unit: string;
  yesNo: [string, string];
}

function formatNumberSpec({ value, f, unit }: SpecFormatArgs): string | null {
  if (typeof value === "number") return f.format(value) + unit;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as { min: number; max: number };
  return r.min === r.max ? f.format(r.min) + unit : `${f.format(r.min)}–${f.format(r.max)}${unit}`;
}

function formatMultiSpec({ attr, value }: SpecFormatArgs): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const labels = value.map((v) => attr.options?.find((x) => x.value === v)?.label).filter(Boolean);
  return labels.length ? labels.join(", ") : null;
}

const SPEC_FORMATTERS: Record<SpecType, (a: SpecFormatArgs) => string | null> = {
  number: formatNumberSpec,
  enum: ({ attr, value }) => attr.options?.find((x) => x.value === value)?.label ?? null,
  multi: formatMultiSpec,
  bool: ({ value, yesNo }) => (typeof value === "boolean" ? (value ? yesNo[0] : yesNo[1]) : null),
  text: ({ value }) => (typeof value === "string" && value.trim() ? value.trim() : null),
};

/** Grouped rows for the "Характеристики" block; empty groups are dropped. */
export function specRows(schema: CatalogSchema, categoryId: string | null | undefined, specs: Readonly<Record<string, unknown>> | null | undefined, locale: string, yesNo: [string, string]) {
  const attrs = attributesFor(schema, categoryId);
  const groups = [...schema.groups].sort((a, b) => a.sort - b.sort);
  const byGroup = new Map<string, { attr: SpecAttribute; text: string }[]>();
  for (const a of attrs) {
    const text = formatSpec(a, specs?.[a.key], locale, yesNo);
    if (!text) continue;
    if (!byGroup.has(a.group)) byGroup.set(a.group, []);
    byGroup.get(a.group)!.push({ attr: a, text });
  }
  const known = groups.filter((g) => byGroup.has(g.key)).map((g) => ({ group: g, rows: byGroup.get(g.key)! }));
  const orphan = [...byGroup.keys()].filter((k) => !groups.some((g) => g.key === k));
  for (const k of orphan) known.push({ group: { key: k, label: k, sort: 999 }, rows: byGroup.get(k)! });
  return known;
}

/** One-line summary for product cards: "51 г · PAW3950 · 8000 Гц". */
export function specSummary(schema: CatalogSchema, categoryId: string | null | undefined, specs: Readonly<Record<string, unknown>> | null | undefined, locale: string, yesNo: [string, string]): string {
  return attributesFor(schema, categoryId)
    .filter((a) => a.highlight)
    .map((a) => (a.type === "bool" ? (specs?.[a.key] === true ? a.label : null) : formatSpec(a, specs?.[a.key], locale, yesNo)))
    .filter(Boolean)
    .slice(0, 3)
    .join(" · ");
}

// ---- filters ---------------------------------------------------------------------------------

/**
 * Filter state. Serialized into URLs as `?brand=a,b&cond=markdown&f.sensor=paw3950,paw3395&f.weight_g=45-54&f.dpi=min..max&price=100..900`.
 * Attribute filters: enum/multi → option values; number with buckets → bucket ids; number without
 * buckets → one "min..max" (either side may be empty); bool → "1".
 */
export interface CatalogFilter {
  /** Category slug (includes the subtree) or MARKDOWN_COLLECTION_SLUG; null = all. */
  category?: string | null;
  brands?: string[];
  conditions?: ProductCondition[];
  priceMin?: number | null;
  priceMax?: number | null;
  inStock?: boolean;
  q?: string;
  attrs?: Record<string, string[]>;
}

/**
 * Catalog fields as the storefront DTO carries them (OpenAPI: absence = null, specs = `{[key]: unknown}`). Wider than
 * `CatalogFields` on purpose: the engine reads wire data and checks every spec value by the attribute type anyway.
 */
export interface WireCatalogFields extends Omit<CatalogFields, "condition" | "specs"> {
  condition?: ProductCondition | null;
  specs?: Readonly<Record<string, unknown>>;
}

export interface FilterableProduct extends WireCatalogFields {
  id: string;
  title: string;
  priceMinor: number;
  stock?: number;
  /** When present and non-empty, stock is the sum of the variants' (as the backend's effectiveStock). */
  variants?: { stock: number }[] | null;
}

/** Effective stock: sum of the variants when there are any, else the product's own. */
function effectiveStock(p: FilterableProduct): number {
  return p.variants?.length ? p.variants.reduce((n, v) => n + Math.max(0, v.stock), 0) : p.stock ?? 0;
}

export interface FacetValue {
  value: string;
  label: string;
  /** Products that would match if this value were (also) selected, with every other facet applied. */
  count: number;
  selected: boolean;
}

export interface Facet {
  /** "brand" | "cond" | attribute key. */
  key: string;
  label: string;
  kind: "options" | "range" | "bool";
  group?: string;
  unit?: string | null;
  values: FacetValue[];
  /** kind=range: bounds of the current selection without this facet. */
  min?: number;
  max?: number;
  selectedRange?: { min: number | null; max: number | null };
}

function numericOf(v: unknown): { min: number; max: number } | null {
  if (typeof v === "number") return { min: v, max: v };
  if (v && typeof v === "object" && !Array.isArray(v) && typeof (v as { min: number }).min === "number") return v as { min: number; max: number };
  return null;
}

function matchesAttr(attr: SpecAttribute, value: unknown, selected: string[]): boolean {
  if (selected.length === 0) return true;
  switch (attr.type) {
    case "enum":
      return typeof value === "string" && selected.includes(value);
    case "multi":
      return Array.isArray(value) && value.some((v) => selected.includes(v));
    case "bool":
      return value === true;
    case "number": {
      const n = numericOf(value);
      if (!n) return false;
      if (attr.buckets?.length) {
        return selected.some((id) => {
          const b = attr.buckets!.find((x) => x.id === id);
          return !!b && (b.min === null || n.max >= b.min) && (b.max === null || n.min <= b.max);
        });
      }
      const r = parseRange(selected[0]);
      if (!r) return true;
      return (r.min === null || n.max >= r.min) && (r.max === null || n.min <= r.max);
    }
    default:
      return true;
  }
}

function normalize(s: string) {
  return s.toLocaleLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

/** Context resolved once per (schema, filter). */
function resolve(schema: CatalogSchema, filter: CatalogFilter) {
  const cat = filter.category && filter.category !== MARKDOWN_COLLECTION_SLUG ? categoryBySlug(schema, filter.category) : null;
  const scope = cat ? subtreeIds(schema, cat.id) : null;
  const attrs = attributesFor(schema, cat?.id ?? null);
  return { cat, scope, attrs, markdownOnly: filter.category === MARKDOWN_COLLECTION_SLUG };
}

type Ctx = ReturnType<typeof resolve>;

function matchesQuery(p: FilterableProduct, q: string): boolean {
  const hay = normalize(`${p.title} ${p.brandRef?.name ?? ""}`);
  return normalize(q).split(" ").every((w) => hay.includes(w));
}

function matchesPrice(p: FilterableProduct, f: CatalogFilter): boolean {
  const uah = toMajor(p.priceMinor);
  if (f.priceMin != null && uah < f.priceMin) return false;
  return !(f.priceMax != null && uah > f.priceMax);
}

function matchesAttrs(p: FilterableProduct, f: CatalogFilter, ctx: Ctx, skip?: string): boolean {
  for (const a of ctx.attrs) {
    if (!a.filterable || a.key === skip) continue;
    const sel = f.attrs?.[a.key];
    if (sel?.length && !matchesAttr(a, p.specs?.[a.key], sel)) return false;
  }
  return true;
}

function matchesScope(p: FilterableProduct, ctx: Ctx): boolean {
  if (ctx.scope && !(p.categoryId && ctx.scope.has(p.categoryId))) return false;
  return !(ctx.markdownOnly && (p.condition ?? "NEW") === "NEW");
}

function matchesBrandAndCondition(p: FilterableProduct, f: CatalogFilter, skip?: string): boolean {
  if (skip !== "brand" && f.brands?.length && !(p.brandRef && f.brands.includes(p.brandRef.slug))) return false;
  return !(skip !== "cond" && f.conditions?.length && !f.conditions.includes(p.condition ?? "NEW"));
}

/** Everything except the facet named `skip` ("brand" | "cond" | "price" | attribute key). */
function matches<P extends FilterableProduct>(p: P, f: CatalogFilter, ctx: Ctx, skip?: string): boolean {
  if (!matchesScope(p, ctx)) return false;
  if (f.inStock && !(effectiveStock(p) > 0)) return false;
  if (f.q && !matchesQuery(p, f.q)) return false;
  if (!matchesBrandAndCondition(p, f, skip)) return false;
  if (skip !== "price" && !matchesPrice(p, f)) return false;
  return matchesAttrs(p, f, ctx, skip);
}

export function filterProducts<P extends FilterableProduct>(schema: CatalogSchema, products: P[], filter: CatalogFilter): P[] {
  const ctx = resolve(schema, filter);
  return products.filter((p) => matches(p, filter, ctx));
}

/**
 * Facets for the current filter: brand, condition, then the filterable attributes of the selected
 * category (global ones too). A facet's counts ignore its own selection (classic disjunctive
 * faceting), so picking "Attack Shark" still shows how many "ATK" there are. Values with zero
 * products that are not selected are dropped; a facet with < 2 values and no selection is dropped.
 */
export function buildFacets<P extends FilterableProduct>(
  schema: CatalogSchema,
  products: P[],
  filter: CatalogFilter,
  labels: { brand: string; condition: string },
): Facet[] {
  const ctx = resolve(schema, filter);
  const pool = (skip: string) => products.filter((p) => matches(p, filter, ctx, skip));
  const out: Facet[] = [];
  const push = (f: Facet | null) => {
    if (f) out.push(f);
  };

  push(brandFacet(schema, pool("brand"), filter, labels.brand));
  // condition (hidden inside the markdown collection itself)
  if (!ctx.markdownOnly) push(conditionFacet(schema, pool("cond"), filter, labels.condition));
  for (const a of ctx.attrs) {
    if (!a.filterable || a.type === "text") continue;
    push(attrFacet(a, pool(a.key), filter.attrs?.[a.key] ?? []));
  }
  return out;
}

function brandFacet(schema: CatalogSchema, base: FilterableProduct[], filter: CatalogFilter, label: string): Facet | null {
  const counts = new Map<string, number>();
  for (const p of base) if (p.brandRef) counts.set(p.brandRef.slug, (counts.get(p.brandRef.slug) ?? 0) + 1);
  const sel = new Set(filter.brands ?? []);
  const values = schema.brands
    .filter((b) => counts.has(b.slug) || sel.has(b.slug))
    .map((b) => ({ value: b.slug, label: b.name, count: counts.get(b.slug) ?? 0, selected: sel.has(b.slug) }))
    .sort((a, b) => Number(b.selected) - Number(a.selected) || b.count - a.count || a.label.localeCompare(b.label));
  return values.length > 1 || sel.size ? { key: "brand", label, kind: "options", values } : null;
}

function conditionFacet(schema: CatalogSchema, base: FilterableProduct[], filter: CatalogFilter, label: string): Facet | null {
  const sel = new Set(filter.conditions ?? []);
  const values = schema.conditions
    .map((c) => ({ value: c.value, label: c.label, count: base.filter((p) => (p.condition ?? "NEW") === c.value).length, selected: sel.has(c.value) }))
    .filter((v) => v.count > 0 || v.selected);
  return values.length > 1 || sel.size ? { key: "cond", label, kind: "options", values } : null;
}

/** Options facet from `{value,label}` candidates: zero-count unselected values dropped, < 2 values without selection → no facet. */
function optionsFacet(a: SpecAttribute, base: FilterableProduct[], sel: string[], candidates: { value: string; label: string }[]): Facet | null {
  const values = candidates
    .map((o) => ({ value: o.value, label: o.label, count: base.filter((p) => matchesAttr(a, p.specs?.[a.key], [o.value])).length, selected: sel.includes(o.value) }))
    .filter((v) => v.count > 0 || v.selected);
  return values.length > 1 || sel.length ? { key: a.key, label: a.label, kind: "options", group: a.group, unit: a.unit, values } : null;
}

function boolFacet(a: SpecAttribute, base: FilterableProduct[], sel: string[]): Facet | null {
  const count = base.filter((p) => p.specs?.[a.key] === true).length;
  if (count === 0 && !sel.length) return null;
  return { key: a.key, label: a.label, kind: "bool", group: a.group, values: [{ value: "1", label: a.label, count, selected: sel.length > 0 }] };
}

function rangeFacet(a: SpecAttribute, base: FilterableProduct[], sel: string[]): Facet | null {
  const nums = base.map((p) => numericOf(p.specs?.[a.key])).filter((x): x is { min: number; max: number } => !!x);
  if (nums.length < 2 && !sel.length) return null;
  const min = Math.min(...nums.map((n) => n.min));
  const max = Math.max(...nums.map((n) => n.max));
  if (min === max && !sel.length) return null;
  return { key: a.key, label: a.label, kind: "range", group: a.group, unit: a.unit, values: [], min, max, selectedRange: parseRange(sel[0]) ?? undefined };
}

function attrFacet(a: SpecAttribute, base: FilterableProduct[], sel: string[]): Facet | null {
  switch (a.type) {
    case "enum":
    case "multi":
      return optionsFacet(a, base, sel, a.options ?? []);
    case "bool":
      return boolFacet(a, base, sel);
    case "number":
      return a.buckets?.length
        ? optionsFacet(a, base, sel, a.buckets.map((b) => ({ value: b.id, label: b.label ?? b.id })))
        : rangeFacet(a, base, sel);
    default:
      return null;
  }
}

/** Price bounds (UAH) of the selection ignoring the price filter itself. */
export function priceBounds<P extends FilterableProduct>(schema: CatalogSchema, products: P[], filter: CatalogFilter): { min: number; max: number } | null {
  const ctx = resolve(schema, filter);
  const prices = products.filter((p) => matches(p, filter, ctx, "price")).map((p) => toMajor(p.priceMinor));
  return prices.length ? { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) } : null;
}

/** Number of active filter values (for the "Фильтры (N)" badge); category and q are not counted. */
export function activeFilterCount(f: CatalogFilter): number {
  return (
    (f.brands?.length ?? 0) +
    (f.conditions?.length ?? 0) +
    (f.priceMin != null || f.priceMax != null ? 1 : 0) +
    (f.inStock ? 1 : 0) +
    Object.values(f.attrs ?? {}).reduce((n, v) => n + (v.length ? (v.length === 1 && v[0].includes("..") ? 1 : v.length) : 0), 0)
  );
}
