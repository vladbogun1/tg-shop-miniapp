/**
 * Filter <-> URL (de)serialization, split out of catalog.ts; re-exported from there, so the public
 * `@shop/core/catalog` API is unchanged. Imports only types from catalog.ts (no runtime cycle).
 */

import type { CatalogFilter, ProductCondition } from "./catalog";

export function parseRange(s: string | undefined): { min: number | null; max: number | null } | null {
  if (!s || !s.includes("..")) return null;
  const [a, b] = s.split("..");
  const min = a.trim() === "" ? null : Number(a);
  const max = b.trim() === "" ? null : Number(b);
  if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max))) return null;
  return { min, max };
}

const list = (s: string | null | undefined) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : []);

/** Reads the filter from URLSearchParams (site and Mini App share the format). Category comes from the path on the site. */
export function filterFromParams(sp: URLSearchParams | Record<string, string | string[] | undefined>): CatalogFilter {
  const get = (k: string): string | undefined => {
    if (sp instanceof URLSearchParams) return sp.get(k) ?? undefined;
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const keys = sp instanceof URLSearchParams ? [...sp.keys()] : Object.keys(sp);
  const attrs: Record<string, string[]> = {};
  for (const k of keys) {
    if (!k.startsWith("f.")) continue;
    const v = get(k);
    if (v) attrs[k.slice(2)] = v.includes("..") ? [v] : list(v);
  }
  const price = parseRange(get("price"));
  const cond = list(get("cond")).map((c) => c.toUpperCase()).filter((c): c is ProductCondition => c === "NEW" || c === "MARKDOWN" || c === "USED");
  return {
    brands: list(get("brand")),
    conditions: cond,
    priceMin: price?.min ?? null,
    priceMax: price?.max ?? null,
    inStock: get("inStock") === "1" || get("inStock") === "true",
    q: get("q") || undefined,
    attrs,
  };
}

const PLAIN_KEYS = ["brand", "cond", "price", "inStock", "q"];

/** Removes every key this module owns (plain ones and `f.*`). */
function clearFilterKeys(sp: URLSearchParams) {
  for (const k of [...sp.keys()]) if (k.startsWith("f.") || PLAIN_KEYS.includes(k)) sp.delete(k);
}

function setAttrParams(sp: URLSearchParams, attrs: Record<string, string[]> | undefined) {
  for (const k of Object.keys(attrs ?? {}).sort()) {
    const v = attrs![k];
    if (v?.length) sp.set(`f.${k}`, v.join(","));
  }
}

/** Writes the filter (without category) into URLSearchParams, stable order. */
export function filterToParams(f: CatalogFilter, base?: URLSearchParams): URLSearchParams {
  const sp = new URLSearchParams(base);
  clearFilterKeys(sp);
  if (f.q) sp.set("q", f.q);
  if (f.brands?.length) sp.set("brand", f.brands.join(","));
  if (f.conditions?.length) sp.set("cond", f.conditions.map((c) => c.toLowerCase()).join(","));
  if (f.priceMin != null || f.priceMax != null) sp.set("price", `${f.priceMin ?? ""}..${f.priceMax ?? ""}`);
  if (f.inStock) sp.set("inStock", "1");
  setAttrParams(sp, f.attrs);
  return sp;
}

/** Toggles one value of a multi-select facet. */
export function toggleFacet(f: CatalogFilter, key: string, value: string): CatalogFilter {
  const flip = (arr: string[] | undefined) => (arr?.includes(value) ? arr.filter((x) => x !== value) : [...(arr ?? []), value]);
  if (key === "brand") return { ...f, brands: flip(f.brands) };
  if (key === "cond") return { ...f, conditions: flip(f.conditions) as ProductCondition[] };
  return { ...f, attrs: { ...(f.attrs ?? {}), [key]: flip(f.attrs?.[key]) } };
}

/** Keeps brand/price/condition/stock/q, drops attribute filters — used when the category changes. */
export function filterForCategory(f: CatalogFilter, category: string | null): CatalogFilter {
  return { ...f, category, attrs: {} };
}
