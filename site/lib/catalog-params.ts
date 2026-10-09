/**
 * Catalog URL state: the shared filter format (`filterFromParams` / `filterToParams` in
 * shared/src/catalog.ts — `?brand=a,b&cond=markdown&price=100..900&inStock=1&f.sensor=paw3950`) plus
 * the site's own `sort`, `page` and `from` («Показати ще»: pages from..page are shown together).
 * Safe for server and client components.
 */
import {
  type CatalogFilter,
  type CatalogSort,
  filterFromParams,
  filterToParams,
} from "@shop/shared";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const SORTS: CatalogSort[] = ["default", "price_asc", "price_desc", "new", "name"];

export interface CatalogState {
  /** Path without locale, e.g. "/catalog/myshki" or "/search". */
  basePath: string;
  /** Without `category` (that is the path). */
  filter: CatalogFilter;
  sort: CatalogSort;
  /** 1-based, as shown in the URL. */
  page: number;
  /**
   * «Показати ще»: the first page of the shown run (pages from..page are listed together), so a
   * reload or «back» shows the same list. Absent / ≥ page = just `page`.
   */
  from?: number;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** URL query → catalog state. The old `priceMax=<₴>` links keep working. */
export function stateFromParams(basePath: string, p: Record<string, string | string[] | undefined>): CatalogState {
  const filter = filterFromParams(p);
  const legacyMax = Number(one(p.priceMax) ?? "");
  if (filter.priceMax == null && Number.isFinite(legacyMax) && legacyMax > 0) filter.priceMax = Math.round(legacyMax);
  if (filter.q) filter.q = filter.q.trim().slice(0, 100) || undefined;
  const sortRaw = one(p.sort) ?? "";
  const pageRaw = Number(one(p.page) ?? "1");
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const fromRaw = Number(one(p.from) ?? "");
  const from = Number.isFinite(fromRaw) && fromRaw >= 1 && fromRaw < page ? Math.floor(fromRaw) : undefined;
  return {
    basePath,
    filter,
    sort: (SORTS as string[]).includes(sortRaw) ? (sortRaw as CatalogSort) : "default",
    page,
    ...(from ? { from } : {}),
  };
}

export async function parseCatalogState(basePath: string, sp: SearchParams): Promise<CatalogState> {
  return stateFromParams(basePath, await sp);
}

/**
 * URL (without locale) of a catalog state; defaults are left out. A changed filter should come with
 * `page: 1` in the patch.
 */
export function catalogHref(s: CatalogState, patch: Partial<CatalogState> = {}): string {
  const n = { ...s, ...patch };
  const sp = filterToParams({ ...n.filter, category: undefined });
  if (n.sort !== "default") sp.set("sort", n.sort);
  if (n.page > 1) sp.set("page", String(n.page));
  if (n.from && n.from < n.page) sp.set("from", String(n.from));
  const qs = sp.toString().replace(/%2C/gi, ",").replace(/%2E%2E/gi, "..");
  return qs ? `${n.basePath}?${qs}` : n.basePath;
}

/** Any filter value in the state (search text is not a filter). */
export function hasFilters(f: CatalogFilter): boolean {
  return (
    !!f.brands?.length ||
    !!f.conditions?.length ||
    f.priceMin != null ||
    f.priceMax != null ||
    !!f.inStock ||
    Object.values(f.attrs ?? {}).some((v) => v.length > 0)
  );
}

/** The same state with every filter cleared (search text and sort kept). */
export function clearFilters(s: CatalogState): CatalogState {
  return { ...s, filter: { q: s.filter.q }, page: 1, from: undefined };
}
