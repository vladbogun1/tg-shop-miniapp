import "server-only";
import type { StorefrontProduct } from "@shop/core/site";
import type { Locale } from "@shop/core/i18n";
import { getJson, NotFoundError } from "@/lib/server-http";

/** null when the product does not exist (or is not public). */
export async function getProductBySlug(slug: string, locale: Locale): Promise<StorefrontProduct | null> {
  try {
    return await getJson<StorefrontProduct>(
      `/api/public/products/by-slug/${encodeURIComponent(slug)}`,
      locale,
      ["catalog", `product:${slug}`]
    );
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

/**
 * Category slug to 301 a hidden/archived product's URL to (Google still sends visitors there);
 * null for an unknown slug or a product without a category — those stay 404.
 */
export async function getRetiredProductCategory(slug: string, locale: Locale): Promise<string | null> {
  try {
    const r = await getJson<{ categorySlug: string }>(
      `/api/public/products/retired/${encodeURIComponent(slug)}`,
      locale,
      ["catalog", `product:${slug}`]
    );
    return r.categorySlug;
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}
