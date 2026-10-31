/**
 * «Подарок за сумму / кейсы» — admin API (экран /gift, реестр, заказы).
 * The switch, the case mode and the single gift product (with its threshold) are ordinary settings
 * of the `gift` group (features/settings). The three case tiers (bronze/silver/gold: threshold,
 * guaranteed discount, swap), their prizes and the stats have their own endpoints under /api/admin/gift.
 */
import type { CaseRarity, CaseTier } from "@shop/core/giftcase";
import { apiGet, apiPatch, apiPost, apiPut } from "@/lib/http";
import type {
  AutofillRequest,
  AutofillResult,
  CaseDraftItem,
  CaseItemAdmin,
  CaseTestDraw,
  DraftItem,
  GiftLimit,
  GiftRegistry,
  GiftStats,
  GiftTierAdmin,
  GiftTierPatch,
  LowMargin,
  LowMarginBody,
} from "./model/types";

export const giftApi = {
  tiers: () => apiGet<GiftTierAdmin[]>("/api/admin/gift/tiers"),
  patchTier: (tier: CaseTier, body: GiftTierPatch) => apiPatch<GiftTierAdmin>(`/api/admin/gift/tiers/${tier}`, body),
  caseItems: () => apiGet<CaseItemAdmin[]>("/api/admin/gift/case-items"),
  stats: () => apiGet<GiftStats>("/api/admin/gift/stats"),
  /** Gifts handed over between the dates (YYYY-MM-DD, inclusive, Kyiv). */
  registry: (from: string, to: string) =>
    apiGet<GiftRegistry>(`/api/admin/gift/registry?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  /** Before an admin adds a gift to the order: how much its customer already got this month. */
  limit: (orderId: string) => apiGet<GiftLimit>(`/api/admin/gift/limit?orderId=${encodeURIComponent(orderId)}`),
  /**
   * With `draft` — the unpublished draft is tested instead of the saved prizes.
   * `lowMargin` — as for an order with a low-margin product (product prizes rarer).
   */
  testDraw: (tier: CaseTier, count: number, draft?: CaseDraftItem[], lowMargin = false) =>
    apiPost<CaseTestDraw>(
      `/api/admin/gift/tiers/${tier}/test-draw?count=${count}${lowMargin ? "&lowMargin=true" : ""}`,
      draft ? { items: draft } : undefined
    ),
  lowMargin: () => apiGet<LowMargin>("/api/admin/gift/low-margin"),
  /** Replaces the lists: brand slugs and product ids. */
  setLowMargin: (body: LowMarginBody) => apiPut<LowMargin>("/api/admin/gift/low-margin", body),
  /** «Опубликовать»: the tier's prizes become exactly these. */
  replaceItems: (tier: CaseTier, items: CaseDraftItem[]) => apiPut<CaseItemAdmin[]>(`/api/admin/gift/tiers/${tier}/items`, { items }),
  autofill: (tier: CaseTier, body: AutofillRequest) => apiPost<AutofillResult>(`/api/admin/gift/tiers/${tier}/autofill`, body),
  alternatives: (tier: CaseTier, rarity: CaseRarity, exclude: string[]) => {
    const q = new URLSearchParams({ rarity });
    exclude.forEach((id) => q.append("exclude", id));
    return apiGet<DraftItem[]>(`/api/admin/gift/tiers/${tier}/alternatives?${q}`);
  },
};
