/**
 * «Подарок за сумму / кейсы» — admin API client (page /gift).
 * The switch, the case mode and the single gift product (with its threshold) are ordinary settings
 * of the `gift` group (lib/settings.ts). The three case tiers (bronze/silver/gold: threshold,
 * guaranteed discount, swap), their prizes and the stats have their own endpoints under /api/admin/gift.
 */
import type { CaseItem, CaseRarity, CaseTier } from "@shop/shared";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";

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

/** Where a gift line came from. */
export type GiftSource = "CASE" | "THRESHOLD" | "ADMIN";

export const GIFT_SOURCE_LABEL: Record<GiftSource, string> = {
  CASE: "Кейс",
  THRESHOLD: "Подарок за сумму",
  ADMIN: "От админа",
};

/** One gift handed (or about to be handed) to a customer. */
export interface GiftRegistryRow {
  orderId: string;
  createdAt: string;
  /** Null = not delivered yet: the date of the order counts for now. */
  deliveredAt: string | null;
  status: string;
  customerName: string;
  phone: string;
  tgUsername: string | null;
  /** Groups rows of one person within the response («P12»): an account, a Telegram id or a phone. */
  person: string;
  title: string;
  variant: string | null;
  quantity: number;
  /** Usual price of one unit, kopecks. */
  unitMinor: number;
  valueMinor: number;
  source: GiftSource;
  tier: CaseTier | null;
  /** YYYY-MM of handing over. */
  month: string;
  /** All the person's gifts of that month, kopecks. */
  monthTotalMinor: number;
  overLimit: boolean;
}

export interface GiftRegistry {
  from: string;
  to: string;
  /** gift.monthlyLimitUah in kopecks; 0 = no limit. */
  limitMinor: number;
  count: number;
  totalMinor: number;
  people: number;
  overLimit: number;
  rows: GiftRegistryRow[];
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
  /** Days a promo code won from this tier's case is valid (V57; the reminder comes before it runs out). */
  promoValidDays?: number;
  /** The shop's average margin, % (setting gift.marginPercent): a product prize costs price × (1 − margin). */
  marginPercent?: number;
  /** Orders a month (last 90 days) between this tier's threshold and the next one — expected cases. */
  monthlyOrders?: number;
  /**
   * An order with a low-margin product (Lamzu…): all product prizes together get this % of the chance,
   * discounts the rest (V61). 100 = as usual.
   */
  lowMarginProductPercent?: number;
}

/** Brands and products whose orders get the case leaning to discounts (GET/PUT /api/admin/gift/low-margin). */
export interface LowMargin {
  brands: { slug: string; name: string; productCount: number }[];
  products: { id: string; title: string; imageUrl: string | null; priceMinor: number }[];
  /** Every active product the marks cover. */
  productCount: number;
}

export type GiftTierPatch = Partial<
  Pick<GiftTierAdmin, "enabled" | "thresholdUah" | "guaranteedPercent" | "guaranteedMaxUah" | "swapPercent" | "promoValidDays" | "lowMarginProductPercent">
>;

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

/**
 * A prize of the case builder's draft (PUT /tiers/{tier}/items publishes the whole list; test-draw and
 * autofill take it too). `id` — of a saved prize; null — a new one (the test numbers it −(index + 1)).
 */
export interface CaseDraftItem {
  id: number | null;
  kind: "PRODUCT" | "DISCOUNT";
  productId: string | null;
  discountPercent: number;
  discountUah: number;
  rarity: CaseRarity;
  weight: number;
  active: boolean;
}

/** A draft prize with what the board shows (autofill / alternatives answer with these). */
export interface DraftItem extends CaseDraftItem {
  title: string;
  imageUrl: string | null;
  priceMinor: number;
  stock: number;
  productActive: boolean;
  /** Root category name (autofill / alternatives only). */
  category: string | null;
}

/** «Автособрать» options; omitted = the server's defaults. */
export interface AutofillRequest {
  prizes?: number;
  /** Expected cost of a case as % of the margin on an order at the threshold. */
  costShare?: number;
  marginPercent?: number;
  discounts?: number;
  /** Root category slugs of ordinary prizes / of the jackpot. */
  categories?: string[];
  superCategories?: string[];
  /** A jackpot (gold tier only). */
  jackpot?: boolean;
  newOnly?: boolean;
  minStock?: number;
  /** Kept as they are (rarity too); the rest is picked around them. */
  locked?: CaseDraftItem[];
  seed?: number;
}

export interface AutofillResult {
  tier: CaseTier;
  items: DraftItem[];
  avgPrizeMinor: number;
  avgCostMinor: number;
  marginMinor: number;
  targetCostMinor: number;
  warnings: string[];
}

/** Defaults of «Автособрать» by tier: share of the margin a case may cost, %. */
export const AUTOFILL_COST_SHARE: Record<CaseTier, number> = { BRONZE: 60, SILVER: 50, GOLD: 60 };

export const giftApi = {
  tiers: () => apiGet<GiftTierAdmin[]>("/api/admin/gift/tiers"),
  patchTier: (tier: CaseTier, body: GiftTierPatch) => apiPatch<GiftTierAdmin>(`/api/admin/gift/tiers/${tier}`, body),
  caseItems: () => apiGet<CaseItemAdmin[]>("/api/admin/gift/case-items"),
  createCaseItem: (body: CaseItemCreate) => apiPost<CaseItemAdmin>("/api/admin/gift/case-items", body),
  patchCaseItem: (id: number, body: CaseItemPatch) => apiPatch<CaseItemAdmin>(`/api/admin/gift/case-items/${id}`, body),
  deleteCaseItem: (id: number) => apiDelete<void>(`/api/admin/gift/case-items/${id}`),
  stats: () => apiGet<GiftStats>("/api/admin/gift/stats"),
  /** Gifts handed over between the dates (YYYY-MM-DD, inclusive, Kyiv). */
  registry: (from: string, to: string) =>
    apiGet<GiftRegistry>(`/api/admin/gift/registry?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  /** With `draft` — the unpublished draft is tested instead of the saved prizes. */
  /** `lowMargin` — as for an order with a low-margin product (product prizes rarer). */
  testDraw: (tier: CaseTier, count: number, draft?: CaseDraftItem[], lowMargin = false) =>
    apiPost<CaseTestDraw>(
      `/api/admin/gift/tiers/${tier}/test-draw?count=${count}${lowMargin ? "&lowMargin=true" : ""}`,
      draft ? { items: draft } : undefined
    ),
  lowMargin: () => apiGet<LowMargin>("/api/admin/gift/low-margin"),
  /** Replaces the lists: brand slugs and product ids. */
  setLowMargin: (body: { brands?: string[]; products?: string[] }) => apiPut<LowMargin>("/api/admin/gift/low-margin", body),
  /** «Опубликовать»: the tier's prizes become exactly these. */
  replaceItems: (tier: CaseTier, items: CaseDraftItem[]) => apiPut<CaseItemAdmin[]>(`/api/admin/gift/tiers/${tier}/items`, { items }),
  autofill: (tier: CaseTier, body: AutofillRequest) => apiPost<AutofillResult>(`/api/admin/gift/tiers/${tier}/autofill`, body),
  alternatives: (tier: CaseTier, rarity: CaseRarity, exclude: string[]) => {
    const q = new URLSearchParams({ rarity });
    exclude.forEach((id) => q.append("exclude", id));
    return apiGet<DraftItem[]>(`/api/admin/gift/tiers/${tier}/alternatives?${q}`);
  },
};
