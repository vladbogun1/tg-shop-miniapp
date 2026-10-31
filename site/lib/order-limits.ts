"use client";

/** Лимиты антиспама (GET /api/public/order-limits): логика — @shop/customer/checkout/order-limits, предел отдаём стору корзины. */
import type { OrderLimits } from "@shop/core/types";
import { useOrderLimits as useSharedOrderLimits } from "@shop/customer/checkout/order-limits";
import { api } from "./api";
import { setQtyCap } from "./cart";

export function useOrderLimits(): OrderLimits | undefined {
  return useSharedOrderLimits(api.checkout, setQtyCap);
}
