import "server-only";
import type { CatalogSchema } from "@shop/core/catalog";
import type { CatalogSort, PublicCategory, PublicCategoryDetail, PublicProductPage, StorefrontProduct } from "@shop/core/site";
import type { Locale } from "@shop/core/i18n";
import { catalogSearchParams, type CatalogQuery } from "@/lib/api";
import { SORTS } from "../model/params";
import { PAGE_SIZE } from "@/lib/config";
import { getJson, NotFoundError } from "@/lib/server-http";


export function parseSort(value: string | undefined): CatalogSort {
  return (SORTS as string[]).includes(value ?? "") ? (value as CatalogSort) : "default";
}

export async function getCategories(locale: Locale): Promise<PublicCategory[]> {
  return getJson<PublicCategory[]>("/api/public/categories", locale);
}

/** One category with the SEO of its page; null when the slug is unknown. */
export async function getCategory(slug: string, locale: Locale): Promise<PublicCategoryDetail | null> {
  try {
    return await getJson<PublicCategoryDetail>(`/api/public/categories/${encodeURIComponent(slug)}`, locale);
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

export async function getProducts(q: CatalogQuery, locale: Locale): Promise<PublicProductPage> {
  const sp = catalogSearchParams({ size: PAGE_SIZE, ...q });
  return getJson<PublicProductPage>(`/api/public/products?${sp.toString()}`, locale);
}

/**
 * Catalog v2 schema (category tree, brands, attributes, condition labels), localized.
 * See docs/CATALOG-SPECS.md §3.1 and shared/src/catalog.ts.
 */
export async function getCatalogSchema(locale: Locale): Promise<CatalogSchema> {
  return getJson<CatalogSchema>("/api/public/catalog/schema", locale);
}

/**
 * Every product of a category subtree (or the whole catalog / a search) in one response
 * (`all=1`, backend caps it at 1000) — the site filters, counts facets, sorts and paginates itself
 * with shared/catalog.ts. `category` may be the virtual "utsenka".
 * `view=card`: light items (no description / SEO / conditionNote / tags, first 2 images) — listings
 * must not read those fields; the product page loads the full product by slug.
 */
export async function getListingProducts(locale: Locale, opts: { category?: string | null; q?: string } = {}): Promise<StorefrontProduct[]> {
  const sp = new URLSearchParams({ all: "1", view: "card" });
  if (opts.category) sp.set("category", opts.category);
  if (opts.q) sp.set("q", opts.q);
  const page = await getJson<PublicProductPage | StorefrontProduct[]>(`/api/public/products?${sp.toString()}`, locale);
  return Array.isArray(page) ? page : page.items;
}

/** Largest page the backend serves (PublicCatalogService.MAX_PAGE_SIZE). */
const MAX_PAGE_SIZE = 60;

/**
 * Every public (active, not archived) product, page by page — for the product feeds. Sorted by name,
 * so the page boundaries do not move with sales. `revalidate` is the data-cache window; the
 * "catalog" tag still drops it early after an admin edit.
 */
export async function getAllProducts(locale: Locale, revalidate: number): Promise<StorefrontProduct[]> {
  const page = (n: number) =>
    getJson<PublicProductPage>(`/api/public/products?sort=name&size=${MAX_PAGE_SIZE}&page=${n}`, locale, ["catalog"], revalidate);
  const first = await page(0);
  const pages = Math.ceil(first.total / MAX_PAGE_SIZE);
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => page(i + 1)));
  const seen = new Set<string>();
  return [first, ...rest].flatMap((p) => p.items).filter((p) => !seen.has(p.id) && !!seen.add(p.id));
}
