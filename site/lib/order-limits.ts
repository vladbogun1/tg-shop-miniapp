"use client";

/**
 * Anti-bot order limits (GET /api/public/order-limits; «Настройки» → «Защита от ботов и спама»).
 * The cart and the product page clamp their quantity steppers to `maxQtyPerProduct`, so the
 * customer never builds a cart the checkout would refuse with QTY_LIMIT. 0 = no limit.
 * The stepper cap itself is `maxQty` from @shop/shared.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type { OrderLimits } from "@shop/shared";
import { api } from "./api";
import { setQtyCap } from "./cart";

export function useOrderLimits(): OrderLimits | undefined {
  const { data } = useQuery({
    queryKey: ["public", "order-limits"],
    queryFn: api.orderLimits,
    staleTime: 10 * 60_000,
    retry: 1,
  });
  useEffect(() => {
    if (data) setQtyCap(data.maxQtyPerProduct);
  }, [data]);
  return data;
}
