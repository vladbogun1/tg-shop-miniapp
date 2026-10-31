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
