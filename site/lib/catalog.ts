/**
 * Catalog v2 on the site (docs/CATALOG-SPECS.md §5 «Сайт»): schema loading, the category tree for
 * menus, and the server-side listing — filter, facets, sort and pagination over the `all=1` product
 * list with the ONE shared engine (shared/src/catalog.ts). Server-only.
 */
import {
  attributesFor,
  buildFacets,
  type CatalogFilter,
  type CatalogSchema,
  type CatalogSort,
  categoryBySlug,
  type Facet,
  filterProducts,
  type FilterableProduct,
  type Locale,
  MARKDOWN_COLLECTION_SLUG,
  priceBounds,
  type PublicCategory,
  type StorefrontProduct,
} from "@shop/shared";
import { makeT } from "@/i18n";
import type { CardContext } from "./card";
import { PAGE_SIZE } from "./config";
import { getCatalogSchema, getCategories, safe } from "./server-api";
import { stockOf } from "./stock";

/** UI words of yes/no for bool specs, in the page language. */
export function yesNo(locale: Locale): [string, string] {
  const t = makeT(locale);
  return [t("catalog.yes"), t("catalog.no")];
}

/**
 * Schema from a backend without catalog v2 (or when the call fails): the menu categories as a flat
 * tree, no brands/attributes. Pages keep working, just without characteristic facets.
 */
function fallbackSchema(categories: PublicCategory[], locale: Locale): CatalogSchema {
  const t = makeT(locale);
  return {
    categories: categories
      .filter((c) => c.slug !== MARKDOWN_COLLECTION_SLUG)
      .map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        parentId: c.parentId ?? null,
        sortOrder: c.sortOrder,
        showInMenu: true,
        artKind: c.artKind ?? null,
        productCount: c.productCount,
      })),
    brands: [],
    groups: [],
    attributes: [],
    conditions: [
      { value: "NEW", label: t("product.cond.NEW") },
      { value: "MARKDOWN", label: t("product.cond.MARKDOWN") },
      { value: "USED", label: t("product.cond.USED") },
    ],
  };
}

/** The localized catalog schema; never throws (falls back to the menu categories). */
export async function loadSchema(locale: Locale): Promise<CatalogSchema> {
  try {
    return await getCatalogSchema(locale);
  } catch (e) {
    if (process.env.NODE_ENV === "development") console.warn("[site] catalog schema unavailable:", e);
    return fallbackSchema(await safe(getCategories(locale), []), locale);
  }
}

export { menuTree, rootOf, type MenuNode } from "./category-tree";

// ---------------------------------------------------------------- listing

export interface Listing {
  /** Pages from..page («Показати ще» appends), ready for the cards (see lib/card). */
  items: StorefrontProduct[];
  total: number;
  pages: number;
  page: number;
  /** First page of the shown run; = page without «Показати ще». */
  from: number;
  facets: Facet[];
  price: { min: number; max: number } | null;
  /** What the filter panel needs to recount a draft selection in the browser (see CatalogEngine). */
  engine: CatalogEngine;
}

/**
 * The listing's product pool cut down to the fields the shared engine reads, plus the slice of the
 * schema it touches. The filter panel keeps a draft selection and recounts «Показати N» and every
 * facet with `filterProducts` / `buildFacets` on the client — the catalog is ~220 products, so a few
 * KB of JSON beats a server round trip per click (and gives the same numbers by construction).
 */
export interface CatalogEngine {
  schema: CatalogSchema;
  products: FilterableProduct[];
  /** The scope the page forces (category slug / markdown collection), never changed by the panel. */
  category: string | null;
  labels: { brand: string; condition: string };
}

/** `filter.category` with an unknown slug dropped (old backend — the product list is already scoped). */
function engineCategory(schema: CatalogSchema, category: string | null | undefined): string | null {
  if (category && category !== MARKDOWN_COLLECTION_SLUG && !categoryBySlug(schema, category)) return null;
  return category ?? null;
}

function catalogEngine(schema: CatalogSchema, products: StorefrontProduct[], category: string | null, labels: CatalogEngine["labels"]): CatalogEngine {
  const cat = category && category !== MARKDOWN_COLLECTION_SLUG ? categoryBySlug(schema, category) : null;
  const attributes = attributesFor(schema, cat?.id ?? null)
    .filter((a) => a.filterable && a.type !== "text")
    .map((a) => ({ ...a, hint: null }));
  const keys = attributes.map((a) => a.key);
  const brandSlugs = new Set(products.map((p) => p.brandRef?.slug).filter(Boolean));
  return {
    schema: {
      categories: schema.categories.map((c) => ({ ...c, name: "", artKind: null })),
      brands: schema.brands.filter((b) => brandSlugs.has(b.slug)),
      groups: [],
      attributes,
      conditions: schema.conditions,
    },
    products: products.map((p) => {
      const specs: NonNullable<FilterableProduct["specs"]> = {};
      for (const k of keys) if (p.specs?.[k] !== undefined) specs[k] = p.specs[k];
      return {
        id: p.id,
        title: "",
        priceMinor: p.priceMinor,
        stock: stockOf(p, null),
        categoryId: p.categoryId ?? null,
        brandRef: p.brandRef ? { id: p.brandRef.id, slug: p.brandRef.slug, name: "" } : null,
        condition: p.condition ?? "NEW",
        specs,
      };
    }),
    category,
    labels,
  };
}

/** Same order as the backend (PublicCatalogService.comparator): out of stock sinks, then the sort. */
function sortProducts(items: StorefrontProduct[], sort: CatalogSort, locale: Locale): StorefrontProduct[] {
  const sunk = (p: StorefrontProduct) => (stockOf(p, null) > 0 ? 0 : 1);
  const created = (p: StorefrontProduct) => Date.parse(p.createdAt ?? "") || 0;
  const order: (a: StorefrontProduct, b: StorefrontProduct) => number =
    sort === "price_asc"
      ? (a, b) => a.priceMinor - b.priceMinor || created(b) - created(a)
      : sort === "price_desc"
        ? (a, b) => b.priceMinor - a.priceMinor || created(b) - created(a)
        : sort === "new"
          ? (a, b) => created(b) - created(a)
          : sort === "name"
            ? (a, b) => a.title.localeCompare(b.title, locale, { sensitivity: "base" })
            : () => 0; // default: the backend's best-sellers order, kept by the stable sort
  return items.slice().sort((a, b) => sunk(a) - sunk(b) || order(a, b));
}

/**
 * Filters, counts facets, sorts and slices one page. `filter.category` scopes the engine (subtree /
 * markdown collection); `filter.q` is left to the backend (it searches more than the title), so the
 * caller passes it separately in the URL state only.
 */
export function computeListing(
  schema: CatalogSchema,
  products: StorefrontProduct[],
  filter: CatalogFilter,
  sort: CatalogSort,
  page: number,
  locale: Locale,
  from?: number
): Listing {
  const t = makeT(locale);
  const engineFilter: CatalogFilter = { ...filter, q: undefined, category: engineCategory(schema, filter.category) };
  const labels = { brand: t("catalog.brand"), condition: t("catalog.condition") };
  const matched = filterProducts(schema, products, engineFilter);
  const facets = buildFacets(schema, products, engineFilter, labels);
  const sorted = sortProducts(matched, sort, locale);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const cur = Math.min(Math.max(1, page), pages);
  const first = Math.min(Math.max(1, from ?? cur), cur);
  return {
    items: sorted.slice((first - 1) * PAGE_SIZE, cur * PAGE_SIZE),
    total: sorted.length,
    pages,
    page: cur,
    from: first,
    facets,
    price: priceBounds(schema, products, engineFilter),
    engine: catalogEngine(schema, products, engineFilter.category ?? null, labels),
  };
}

/** What the product tiles need to print their spec line. */
export function cardContext(schema: CatalogSchema | null, locale: Locale): CardContext {
  return { schema, locale, yesNo: yesNo(locale) };
}
