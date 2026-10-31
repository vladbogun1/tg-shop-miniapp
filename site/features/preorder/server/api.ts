import "server-only";
import type { Locale } from "@shop/core/i18n";
import { getJson, NotFoundError } from "@/lib/server-http";
import { buildPreorderIndex, type ComingBatch, type PreorderIndex, type ProductPreorder } from "../model/core";

/**
 * Open pre-order batches («Скоро в наявності»), soonest first. Tagged "catalog": the backend drops that
 * tag whenever a batch changes status, so a product turns into «Передзамовлення» without waiting.
 */
export async function getComingBatches(locale: Locale): Promise<ComingBatch[]> {
  return getJson<ComingBatch[]>("/api/public/preorders", locale, ["catalog", "preorders"]);
}

/** Pre-order block of a product for a guest; null when unavailable. */
export async function getProductPreorder(productId: string, slug: string, locale: Locale): Promise<ProductPreorder | null> {
  try {
    return await getJson<ProductPreorder>(`/api/public/products/${productId}/preorder`, locale, ["catalog", "preorders", `product:${slug}`]);
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}


/** Open batches as an index for the tiles; null when the backend has no pre-orders (older) or fails. */
export async function getPreorderIndex(locale: Locale): Promise<PreorderIndex | null> {
  try {
    return buildPreorderIndex(await getComingBatches(locale));
  } catch (e) {
    if (process.env.NODE_ENV === "development") console.warn("[site] pre-orders unavailable:", e);
    return null;
  }
}
