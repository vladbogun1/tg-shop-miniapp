/**
 * «Вместе дешевле» and the gift for the order sum — admin API client (page /bundles).
 * Terms (percents, caps, the gift) are ordinary settings of the `bundles` group (lib/settings.ts);
 * the category pairs, the preview and the stats have their own endpoints under /api/admin/bundles.
 */
import type { BundleTerms, Product } from "@shop/shared";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";

/** «Мыши → Глайды»: to a product of the source category (or its subcategories) offer the target's. */
export interface BundleRule {
  id: number;
  sourceCategoryId: string;
  /** «Коврики › Тканевые» for a subcategory. */
  sourceCategoryName: string;
  targetCategoryId: string;
  targetCategoryName: string;
  sortOrder: number;
  active: boolean;
}

export interface BundlePreview {
  productId: string;
  terms: BundleTerms;
  /** What the customer sees next to the product, best first (computed even when switched off). */
  items: Product[];
}

/** Last 30 days. */
export interface BundleStats {
  since: string;
  orders: number;
  bundleOrders: number;
  bundleDiscountMinor: number;
  bundleRevenueMinor: number;
  giftOrders: number;
}

export const BUNDLES_GROUP = "bundles";

export const bundlesApi = {
  rules: () => apiGet<BundleRule[]>("/api/admin/bundles/rules"),
  createRule: (body: { sourceCategoryId: string; targetCategoryId: string; sortOrder?: number; active?: boolean }) =>
    apiPost<BundleRule>("/api/admin/bundles/rules", body),
  patchRule: (id: number, body: { sortOrder?: number; active?: boolean }) =>
    apiPatch<BundleRule>(`/api/admin/bundles/rules/${id}`, body),
  deleteRule: (id: number) => apiDelete<void>(`/api/admin/bundles/rules/${id}`),
  preview: (productId: string) =>
    apiGet<BundlePreview>(`/api/admin/bundles/preview?productId=${encodeURIComponent(productId)}`),
  stats: () => apiGet<BundleStats>("/api/admin/bundles/stats"),
};

/** Units on hand: the sum over variants when the product has them. */
export function productStock(p: Pick<Product, "stock" | "variants">): number {
  return p.variants?.length ? p.variants.reduce((s, v) => s + (v.stock ?? 0), 0) : p.stock ?? 0;
}
