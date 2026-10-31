"use client";

/** Лимиты антиспама (GET /api/public/order-limits): логика — @shop/customer/checkout/order-limits, предел отдаём стору корзины. */
import { useOrderLimits as useSharedOrderLimits } from "@shop/customer/checkout/order-limits";
import { customerApi, type OrderLimits } from "./api";
import { setQtyCap } from "./cart";

export function useOrderLimits(): OrderLimits | undefined {
  return useSharedOrderLimits(customerApi.checkout, setQtyCap);
}
