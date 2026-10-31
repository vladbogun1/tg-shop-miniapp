import "server-only";
import { type CatalogSchema, MARKDOWN_COLLECTION_SLUG } from "@shop/core/catalog";
import { type PublicCategory } from "@shop/core/site";
import { type Locale } from "@shop/core/i18n";
import { makeT } from "@/i18n";
import { safe } from "@/lib/server-http";
import { getCatalogSchema, getCategories } from "./api";

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
