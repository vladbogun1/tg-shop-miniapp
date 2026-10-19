/**
 * «Подарок за сумму / кейсы» — admin API client (page /gift).
 * The switch, the case mode and the single gift product (with its threshold) are ordinary settings
 * of the `gift` group (lib/settings.ts). The three case tiers (bronze/silver/gold: threshold,
 * guaranteed discount, swap), their prizes and the stats have their own endpoints under /api/admin/gift.
 */
import type { CaseItem, CaseRarity, CaseTier } from "@shop/shared";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";

export const GIFT_GROUP = "gift";

/** Per tier, last 30 days. */
export interface GiftTierStats {
  tier: CaseTier;
  /** Orders with a case of this tier / of them opened. */
  cases: number;
  opened: number;
  /** Orders that took the tier's guaranteed discount instead of the case. */
  guaranteed: number;
}

/** Last 30 days. */
export interface GiftStats {
  since: string;
  orders: number;
  giftOrders: number;
  /** Orders whose gift was a case and how many of them the customer already opened. */
  caseOrders: number;
  casesOpened: number;
  /** Orders that took the guaranteed discount, and its sum. */
  guaranteedOrders?: number;
  guaranteedMinor?: number;
  /** Product prizes swapped for a code. */
  swaps?: number;
  /** Discount prizes that dropped. */
  discountPrizes?: number;
  tiers?: GiftTierStats[];
}

/** A case tier: from which order sum, the guaranteed discount offered instead, the swap of a similar prize. */
export interface GiftTierAdmin {
  tier: CaseTier;
  enabled: boolean;
  thresholdUah: number;
  /** % off the order instead of the case; 0 = no choice. */
  guaranteedPercent: number;
  /** Cap of that discount, ₴; 0 = no cap. */
  guaranteedMaxUah: number;
  /** A product prize similar to a bought one may be swapped for a code worth this % of its price; 0 = off. */
  swapPercent: number;
  prizes: number;
  /** Prizes that can drop now (active, in stock / a discount). */
  livePrizes: number;
  /** Average prize value by the real chances (discounts by their ₴ / not counted for %). */
  avgPrizeMinor: number;
}

export type GiftTierPatch = Partial<Pick<GiftTierAdmin, "enabled" | "thresholdUah" | "guaranteedPercent" | "guaranteedMaxUah" | "swapPercent">>;

/** A prize of a case tier: a product, or a discount on the next order (a personal promo code). */
export interface CaseItemAdmin {
  id: number;
  tier: CaseTier;
  kind: "PRODUCT" | "DISCOUNT";
  productId: string | null;
  title: string;
  imageUrl: string | null;
  priceMinor: number;
  stock: number;
  productActive: boolean;
  /** DISCOUNT: % (0 → discountUah). */
  discountPercent: number;
  /** DISCOUNT: fixed ₴. */
  discountUah: number;
  rarity: CaseRarity;
  weight: number;
  /** Chance among the tier's prizes that can drop now, % (0 when this one can't drop). */
  chancePercent: number;
  sortOrder: number;
  active: boolean;
}

/** Russian names of the case rarities (admin is Russian-only). */
export const CASE_RARITY_LABEL: Record<CaseRarity, string> = {
  COMMON: "Обычный",
  RARE: "Редкий",
  EPIC: "Эпический",
  LEGENDARY: "Легендарный",
  GOLD: "Золотой",
};

export const CASE_TIER_LABEL: Record<CaseTier, string> = {
  BRONZE: "Бронзовый",
  SILVER: "Серебряный",
  GOLD: "Золотой",
};

export type CaseItemPatch = {
  rarity?: CaseRarity;
  weight?: number;
  sortOrder?: number;
  active?: boolean;
  discountPercent?: number;
  discountUah?: number;
};

/** A prize of the test pool: how often it dropped in this run and its real chance among the prizes that can drop. */
export interface CaseTestHit {
  /** gift_case_items.id */
  id: number;
  /** «p<productId>» / «d<id>» (= CaseItem.key). */
  key: string;
  hits: number;
  chancePercent: number;
}

/**
 * «Тест кейса» (POST /api/admin/gift/tiers/{tier}/test-draw?count=N): N draws of the checkout's
 * algorithm with nothing saved — no order, promo code, stock reserve or journal entry.
 */
export interface CaseTestDraw {
  tier: CaseTier;
  count: number;
  /** The first draw (a single opening with the reel). */
  won: CaseItem;
  /** The first draws in order (up to 20). */
  drops: CaseItem[];
  /** The tier's prizes that can drop now — for the reel. */
  reel: CaseItem[];
  hits: CaseTestHit[];
}

/** Upper bound of one test run (the server's GiftService.TEST_MAX_COUNT). */
export const CASE_TEST_MAX = 10_000;

export type CaseItemCreate = CaseItemPatch & { tier: CaseTier; kind: "PRODUCT" | "DISCOUNT"; productId?: string };

export const giftApi = {
  tiers: () => apiGet<GiftTierAdmin[]>("/api/admin/gift/tiers"),
  patchTier: (tier: CaseTier, body: GiftTierPatch) => apiPatch<GiftTierAdmin>(`/api/admin/gift/tiers/${tier}`, body),
  caseItems: () => apiGet<CaseItemAdmin[]>("/api/admin/gift/case-items"),
  createCaseItem: (body: CaseItemCreate) => apiPost<CaseItemAdmin>("/api/admin/gift/case-items", body),
  patchCaseItem: (id: number, body: CaseItemPatch) => apiPatch<CaseItemAdmin>(`/api/admin/gift/case-items/${id}`, body),
  deleteCaseItem: (id: number) => apiDelete<void>(`/api/admin/gift/case-items/${id}`),
  stats: () => apiGet<GiftStats>("/api/admin/gift/stats"),
  testDraw: (tier: CaseTier, count: number) => apiPost<CaseTestDraw>(`/api/admin/gift/tiers/${tier}/test-draw?count=${count}`),
};
