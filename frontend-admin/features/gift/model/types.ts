/**
 * Типы подарков и кейсов. Ответы — из OpenAPI (`Schemas`); в схеме перечисления (`tier`, `kind`, `rarity`,
 * `source`) — просто `string`, а пустые значения (`imageUrl`, `productId`…) не помечены как null, поэтому здесь
 * они сужены до того, что бэкенд отдаёт на самом деле (CaseTier, CaseRarity, `string | null`).
 */
import type { Schemas } from "@shop/core/api/schemas";
import type { CaseItem, CaseRarity, CaseTier } from "@shop/core/giftcase";

/** Where a gift line came from. */
export type GiftSource = "CASE" | "THRESHOLD" | "ADMIN";

/** Per tier, last 30 days. */
export type GiftTierStats = Omit<Schemas["TierStatsDto"], "tier"> & { tier: CaseTier };

/** Last 30 days. */
export type GiftStats = Omit<Schemas["GiftStatsDto"], "tiers"> & { tiers: GiftTierStats[] };

/** One gift handed (or about to be handed) to a customer; `deliveredAt` null = not delivered yet. */
export type GiftRegistryRow = Omit<Schemas["GiftRegistryRowDto"], "deliveredAt" | "tgUsername" | "variant" | "source" | "tier"> & {
  deliveredAt: string | null;
  tgUsername: string | null;
  variant: string | null;
  source: GiftSource;
  tier: CaseTier | null;
};

export type GiftRegistry = Omit<Schemas["GiftRegistryDto"], "rows"> & { rows: GiftRegistryRow[] };

/** Gifts of an order's customer this month (this order included) against the monthly limit. */
export type GiftLimit = Schemas["GiftLimitDto"];

/** A case tier: from which order sum, the guaranteed discount offered instead, the swap of a similar prize. */
export type GiftTierAdmin = Omit<Schemas["TierAdminDto"], "tier"> & { tier: CaseTier };

export type GiftTierPatch = Schemas["TierRequest"];

/** Brands and products whose orders get the case leaning to discounts (GET/PUT /api/admin/gift/low-margin). */
export type LowMargin = Omit<Schemas["LowMarginDto"], "products"> & {
  products: (Omit<Schemas["LowMarginProductDto"], "imageUrl"> & { imageUrl: string | null })[];
};

/** A prize of a case tier: a product, or a discount on the next order (a personal promo code). */
export type CaseItemAdmin = Omit<Schemas["CaseItemAdminDto"], "tier" | "kind" | "rarity" | "imageUrl" | "productId"> & {
  tier: CaseTier;
  kind: "PRODUCT" | "DISCOUNT";
  productId: string | null;
  imageUrl: string | null;
  rarity: CaseRarity;
};

/**
 * A prize of the case builder's draft (PUT /tiers/{tier}/items publishes the whole list; test-draw and
 * autofill take it too). `id` — of a saved prize; null — a new one (the test numbers it −(index + 1)).
 */
export type CaseDraftItem = Omit<
  Schemas["CaseDraftItem"],
  "id" | "kind" | "productId" | "rarity" | "discountPercent" | "discountUah" | "weight" | "active"
> & {
  id: number | null;
  kind: "PRODUCT" | "DISCOUNT";
  productId: string | null;
  rarity: CaseRarity;
  discountPercent: number;
  discountUah: number;
  weight: number;
  active: boolean;
};

/** A draft prize with what the board shows (autofill / alternatives answer with these). */
export type DraftItem = CaseDraftItem &
  Omit<Schemas["DraftItemDto"], keyof CaseDraftItem | "imageUrl" | "category"> & {
    imageUrl: string | null;
    /** Root category name (autofill / alternatives only). */
    category: string | null;
  };

/** «Автособрать» options; omitted = the server's defaults. */
export type AutofillRequest = Omit<Schemas["AutofillRequest"], "locked"> & { locked?: CaseDraftItem[] };

export type AutofillResult = Omit<Schemas["AutofillDto"], "tier" | "items"> & { tier: CaseTier; items: DraftItem[] };

/** A prize of the test pool: how often it dropped in this run and its real chance among the prizes that can drop. */
export type CaseTestHit = Schemas["TestHitDto"];

/**
 * «Тест кейса» (POST /api/admin/gift/tiers/{tier}/test-draw?count=N): N draws of the checkout's
 * algorithm with nothing saved — no order, promo code, stock reserve or journal entry.
 */
export type CaseTestDraw = Omit<Schemas["TestDrawDto"], "tier" | "won" | "drops" | "reel"> & {
  tier: CaseTier;
  /** The first draw (a single opening with the reel). */
  won: CaseItem;
  /** The first draws in order (up to 20). */
  drops: CaseItem[];
  /** The tier's prizes that can drop now — for the reel. */
  reel: CaseItem[];
};

/** Body of «Упор на скидки»: brand slugs and product ids (replace the lists). */
export type LowMarginBody = Schemas["LowMarginRequest"];
