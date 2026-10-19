/**
 * «Вместе дешевле» — admin API client (page /bundles).
 * Terms (percents, caps) are ordinary settings of the `bundles` group (lib/settings.ts);
 * the category pairs, the margins, the preview, the funnel, the forecast and the auto-tune have
 * their own endpoints under /api/admin/bundles (docs/BUNDLES.md).
 */
import type { BundleProductOffer } from "@shop/shared";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";

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

/** What the customer sees next to the product (computed even when switched off), with the score. */
export type BundlePreview = BundleProductOffer;

/** Last 30 days. */
export interface BundleStats {
  since: string;
  orders: number;
  bundleOrders: number;
  bundleDiscountMinor: number;
  bundleRevenueMinor: number;
}

/** Margin of a category and the discount cap it gives (cap = manual ?? auto ?? margin − safety). */
export interface BundleMargin {
  categoryId: string;
  categoryName: string;
  parentId: string | null;
  /** Own margin, % (null — inherited from the parent / the shop average). */
  marginPercent: number | null;
  /** Manual cap, % (null — auto / max). */
  discountPercent: number | null;
  autoPercent: number | null;
  autoUpdatedAt: string | null;
  effectiveMarginPercent: number;
  maxPercent: number;
  capPercent: number;
  capSource: "MANUAL" | "AUTO" | "MAX";
}

export interface BundlePairStat {
  sourceCategoryId: string;
  sourceCategoryName: string;
  targetCategoryId: string;
  targetCategoryName: string;
  anchorOrders: number;
  together: number;
  rate: number;
  ruleId: number | null;
  ruleActive: boolean;
  setupRule: boolean;
  /** Often bought together but no pair — worth adding. */
  suggested: boolean;
}

export interface BundleFunnelGroup {
  group: "B" | "H";
  visitors: number;
  withOffer: number;
  added: number;
  ordered: number;
  addonOrders: number;
  orders: number;
}

export interface BundleFunnel {
  since: string;
  groups: BundleFunnelGroup[];
  /** Extra add-on orders in B vs H, % (null — not enough visitors yet). */
  liftPercent: number | null;
  minVisitors: number;
  bySlot: { key: string; views: number; adds: number }[];
  explores: number;
  exploreAdds: number;
}

export interface BundleAutoTune {
  at: string;
  liftUsed: number;
  liftSource: string;
  responsePerPoint: number;
  rows: { categoryId: string; categoryName: string; marginPercent: number; oldPercent: number; newPercent: number; manual: boolean }[];
}

export interface BundleForecast {
  ordersPerMonth: number;
  baseAttachRate: number;
  avgAddonMinor: number;
  avgPercent: number;
  avgMarginPercent: number;
  scenarios: {
    key: string;
    label: string;
    response: number;
    addonOrders: number;
    extraAddonOrders: number;
    revenueMinor: number;
    discountMinor: number;
    profitMinor: number;
  }[];
}

export interface BundleWarning {
  level: "WARN" | "INFO" | string;
  code: string;
  text: string;
  productId: string | null;
  categoryId: string | null;
}

export const BUNDLES_GROUP = "bundles";

type RuleBody = { sourceCategoryId?: string; targetCategoryId?: string; sortOrder?: number; active?: boolean };

export const bundlesApi = {
  rules: () => apiGet<BundleRule[]>("/api/admin/bundles/rules"),
  createRule: (body: RuleBody) => apiPost<BundleRule>("/api/admin/bundles/rules", body),
  patchRule: (id: number, body: RuleBody) => apiPatch<BundleRule>(`/api/admin/bundles/rules/${id}`, body),
  deleteRule: (id: number) => apiDelete<void>(`/api/admin/bundles/rules/${id}`),
  setupRules: () => apiGet<BundleRule[]>("/api/admin/bundles/setup-rules"),
  createSetupRule: (body: RuleBody) => apiPost<BundleRule>("/api/admin/bundles/setup-rules", body),
  patchSetupRule: (id: number, body: RuleBody) => apiPatch<BundleRule>(`/api/admin/bundles/setup-rules/${id}`, body),
  deleteSetupRule: (id: number) => apiDelete<void>(`/api/admin/bundles/setup-rules/${id}`),
  preview: (productId: string) =>
    apiGet<BundlePreview>(`/api/admin/bundles/preview?productId=${encodeURIComponent(productId)}`),
  stats: () => apiGet<BundleStats>("/api/admin/bundles/stats"),
  margins: () => apiGet<BundleMargin[]>("/api/admin/bundles/margins"),
  saveMargin: (body: { categoryId: string; marginPercent: number | null; discountPercent: number | null }) =>
    apiPut<BundleMargin[]>("/api/admin/bundles/margins", body),
  funnel: () => apiGet<BundleFunnel>("/api/admin/bundles/funnel"),
  pairs: () => apiGet<BundlePairStat[]>("/api/admin/bundles/pairs"),
  autotune: () => apiPost<BundleAutoTune>("/api/admin/bundles/autotune", {}),
  forecast: () => apiGet<BundleForecast>("/api/admin/bundles/forecast"),
  warnings: () => apiGet<BundleWarning[]>("/api/admin/bundles/warnings"),
};
