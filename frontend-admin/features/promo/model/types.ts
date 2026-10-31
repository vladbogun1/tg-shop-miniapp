import type { Schemas } from "@shop/core/api/schemas";

/**
 * Where a code came from: OURS — a shared code made on the «Промокоды» page; PERSONAL — a code for
 * one customer; REVIEW — the automatic bonus for a review. Same rule as backend `PromoOrigin`.
 */
export type PromoOrigin = "OURS" | "PERSONAL" | "REVIEW";

type PromoNullable =
  | "discountAmountMinor"
  | "discountPercent"
  | "expiresAt"
  | "maxDiscountMinor"
  | "maxUses"
  | "ownerUserId"
  | "origin"
  | "source"
  | "reservedCount"
  | "usesCount";

/**
 * Промокод из `PromoCodeDto`. Бэкенд присылает пустые поля как null, а более старый — вообще не присылает
 * (`origin`), поэтому экран читает их терпимо; `origin` — закрытое множество.
 */
export type PromoCode = Omit<Schemas["PromoCodeDto"], PromoNullable> & {
  discountAmountMinor?: number | null;
  discountPercent?: number | null;
  /** Ceiling of the discount in kopecks (V63): «5 %, но не больше 100 ₴»; 0 = без потолка. */
  maxDiscountMinor?: number | null;
  maxUses?: number | null;
  /** How many orders used the code. */
  usesCount?: number | null;
  /** Live 30-min holds of customers with the code in the cart. */
  reservedCount?: number | null;
  /** Personal code: only this customer (users.id) may use it (V44 review bonus). */
  ownerUserId?: number | null;
  expiresAt?: string | null;
  source?: "REVIEW_BONUS" | null;
  /** Backend `PromoOrigin` (absent on an older backend — use `promoOrigin()`). */
  origin?: PromoOrigin | null;
};

/** An order with an admin's manual amount/percent discount («Ручная скидка» — not a promo code). */
export type ManualDiscountOrder = Omit<Schemas["ManualDiscountDto"], "label" | "customerName"> & {
  /** «Ручная скидка» or «Ручная скидка 10%». */
  label: string;
  customerName?: string | null;
};

export type PromoOrder = Schemas["PromoOrderDto"];

/** Тело создания/правки: проценты и сумма взаимоисключающие, `maxDiscountMinor` 0 — без потолка. */
export interface PromoBody {
  code: string;
  discountPercent: number | null;
  discountAmountMinor: number | null;
  maxDiscountMinor: number;
  maxUses: number | null;
  active: boolean;
}
