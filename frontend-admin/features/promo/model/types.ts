import type { Schemas } from "@shop/core/api/schemas";

/**
 * Where a code came from: OURS — a shared code made on the «Промокоды» page; PERSONAL — a code for
 * one customer; REVIEW — the automatic bonus for a review; CASE — a prize of the gift case.
 * Same rule as backend `PromoOrigin`.
 */
export type PromoOrigin = Schemas["PromoCodeDto"]["origin"];

/** Промокод из `PromoCodeDto`; `origin` — закрытое множество (бэкенд `PromoOrigin`), пустые поля — null в схеме. */
export type PromoCode = Schemas["PromoCodeDto"];

/** An order with an admin's manual amount/percent discount («Ручная скидка» — not a promo code). */
export type ManualDiscountOrder = Schemas["ManualDiscountDto"];

export type PromoOrder = Schemas["PromoOrderDto"];

/** Тело создания/правки: проценты и сумма взаимоисключающие, `maxDiscountMinor` 0 — без потолка. */
export interface PromoBody {
  code: string;
  discountPercent: number | null;
  discountAmountMinor: number | null;
  maxDiscountMinor: number;
  maxUses: number | null;
  active: boolean;
  /**
   * Последний день действия `yyyy-MM-dd` (по Киеву, до 23:59:59). Нет поля — срок не меняется
   * (быстрое вкл/выкл его не трогает); `noExpiry` — убрать срок.
   */
  expiresOn?: string;
  noExpiry?: boolean;
}

/** Страница вкладки с сервера: `total` — под поиск и состояние, `originTotal` — счётчик вкладки. */
export type PromoPage = Schemas["PromoCodePageDto"];
