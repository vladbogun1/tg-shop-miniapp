/**
 * Типы подарков и кейсов. Ответы — из OpenAPI (`Schemas`): перечисления (`tier`, `kind`, `rarity`, `source`) и
 * пустые значения описаны в DTO бэкенда. Поверх схемы остались только черновик конструктора кейсов (`CaseDraftItem`:
 * в теле запроса всё необязательно, на доске — обязательно) и поля формы.
 */
import type { Schemas } from "@shop/core/api/schemas";

/** Where a gift line came from. */
export type GiftSource = Schemas["GiftRegistryRowDto"]["source"];

/** Per tier, last 30 days. */
export type GiftTierStats = Schemas["TierStatsDto"];

/** Last 30 days. */
export type GiftStats = Schemas["GiftStatsDto"];

/** One gift handed (or about to be handed) to a customer; `deliveredAt` null = not delivered yet. */
export type GiftRegistryRow = Schemas["GiftRegistryRowDto"];

export type GiftRegistry = Schemas["GiftRegistryDto"];

/** Gifts of an order's customer this month (this order included) against the monthly limit. */
export type GiftLimit = Schemas["GiftLimitDto"];

/** A case tier: from which order sum, the guaranteed discount offered instead, the swap of a similar prize. */
export type GiftTierAdmin = Schemas["TierAdminDto"];

export type GiftTierPatch = Schemas["TierRequest"];

/** Brands and products whose orders get the case leaning to discounts (GET/PUT /api/admin/gift/low-margin). */
export type LowMargin = Schemas["LowMarginDto"];

/** A prize of a case tier: a product, or a discount on the next order (a personal promo code). */
export type CaseItemAdmin = Schemas["CaseItemAdminDto"];

/**
 * A prize of the case builder's draft — the request body (everything optional) made strict for the board (PUT /tiers/{tier}/items publishes the whole list; test-draw and
 * autofill take it too). `id` — of a saved prize; null — a new one (the test numbers it −(index + 1)).
 */
export type CaseDraftItem = Omit<
  Schemas["CaseDraftItem"],
  "id" | "kind" | "productId" | "rarity" | "discountPercent" | "discountUah" | "weight" | "active"
> & {
  id: number | null;
  kind: NonNullable<Schemas["CaseDraftItem"]["kind"]>;
  productId: string | null;
  rarity: NonNullable<Schemas["CaseDraftItem"]["rarity"]>;
  discountPercent: number;
  discountUah: number;
  weight: number;
  active: boolean;
};

/** A draft prize with what the board shows (autofill / alternatives answer with these). */
export type DraftItem = CaseDraftItem &
  Omit<Schemas["DraftItemDto"], keyof CaseDraftItem>;

/** «Автособрать» options; omitted = the server's defaults. */
export type AutofillRequest = Omit<Schemas["AutofillRequest"], "locked"> & { locked?: CaseDraftItem[] };

export type AutofillResult = Omit<Schemas["AutofillDto"], "items"> & { items: DraftItem[] };

/** A prize of the test pool: how often it dropped in this run and its real chance among the prizes that can drop. */
export type CaseTestHit = Schemas["TestHitDto"];

/**
 * «Тест кейса» (POST /api/admin/gift/tiers/{tier}/test-draw?count=N): N draws of the checkout's
 * algorithm with nothing saved — no order, promo code, stock reserve or journal entry.
 */
export type CaseTestDraw = Schemas["TestDrawDto"];

/** Body of «Упор на скидки»: brand slugs and product ids (replace the lists). */
export type LowMarginBody = Schemas["LowMarginRequest"];
