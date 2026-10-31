import type { LooseT } from "@shop/core/i18n";
import { parseRange, toggleFacet, type CatalogFilter, type CatalogSchema } from "@shop/core/catalog";

export interface FilterChip {
  id: string;
  label: string;
  remove: (f: CatalogFilter) => CatalogFilter;
}

type Attr = CatalogSchema["attributes"][number];
type Range = (min: number | null | undefined, max: number | null | undefined, unit?: string | null) => string;

const clearAttr = (key: string) => (x: CatalogFilter): CatalogFilter => ({ ...x, attrs: { ...(x.attrs ?? {}), [key]: [] } });

/** Chips of one spec attribute: a yes/no flag, a free number range, or one chip per picked option/bucket. */
function attrChips(a: Attr, key: string, values: string[], range: Range): FilterChip[] {
  if (a.type === "bool") return [{ id: `a:${key}`, label: a.label, remove: clearAttr(key) }];
  if (a.type === "number" && !a.buckets?.length) {
    const r = parseRange(values[0]);
    return r ? [{ id: `a:${key}`, label: `${a.label} ${range(r.min, r.max, a.unit)}`, remove: clearAttr(key) }] : [];
  }
  return values.map((v) => {
    const label = a.options?.find((o) => o.value === v)?.label ?? a.buckets?.find((b) => b.id === v)?.label ?? v;
    const text = a.type === "number" ? `${a.label}: ${label}${a.unit ? ` ${a.unit}` : ""}` : label;
    return { id: `a:${key}:${v}`, label: text, remove: (x: CatalogFilter) => toggleFacet(x, key, v) };
  });
}

function makeRange(t: LooseT, tag: string): Range {
  const nf = new Intl.NumberFormat(tag, { maximumFractionDigits: 2 });
  return (min, max, unit) => {
    const u = unit ? ` ${unit}` : "";
    if (min != null && max != null) return `${nf.format(min)}–${nf.format(max)}${u}`;
    if (min != null) return t("catalog.filter.rangeFrom", { n: nf.format(min) }) + u;
    return t("catalog.filter.rangeTo", { n: nf.format(max ?? 0) }) + u;
  };
}

/** Brand, price, stock and condition chips. */
function baseChips(schema: CatalogSchema, f: CatalogFilter, t: LooseT, range: Range): FilterChip[] {
  const out: FilterChip[] = [];
  for (const b of f.brands ?? []) {
    out.push({ id: `b:${b}`, label: schema.brands.find((x) => x.slug === b)?.name ?? b, remove: (x) => toggleFacet(x, "brand", b) });
  }
  if (f.priceMin != null || f.priceMax != null) {
    out.push({ id: "price", label: range(f.priceMin, f.priceMax, "₴"), remove: (x) => ({ ...x, priceMin: null, priceMax: null }) });
  }
  if (f.inStock) out.push({ id: "stock", label: t("catalog.filter.inStock"), remove: (x) => ({ ...x, inStock: false }) });
  for (const c of f.conditions ?? []) {
    out.push({ id: `c:${c}`, label: schema.conditions.find((x) => x.value === c)?.label ?? c, remove: (x) => toggleFacet(x, "cond", c) });
  }
  return out;
}

/** "Mouse weight: 45–54 g" chips under the category row; × removes one value. */
export function activeFilterChips(schema: CatalogSchema, f: CatalogFilter, t: LooseT, tag: string): FilterChip[] {
  const range = makeRange(t, tag);
  const out = baseChips(schema, f, t, range);
  for (const [key, values] of Object.entries(f.attrs ?? {})) {
    const a = schema.attributes.find((x) => x.key === key);
    if (a && values?.length) out.push(...attrChips(a, key, values, range));
  }
  return out;
}
