"use client";

/**
 * Anti-bot order limits (GET /api/public/order-limits; admin «Настройки» → «Защита от ботов и
 * спама»). The cart store clamps quantities to `maxQtyPerProduct` and the cart steppers stop
 * there, so the checkout is never refused with QTY_LIMIT for a cart built here. 0 = no limit.
 * The stepper cap itself is `maxQty` from @shop/shared.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { customerApi, type OrderLimits } from "./api";
import { setQtyCap } from "./cart";

export function useOrderLimits(): OrderLimits | undefined {
  const { data } = useQuery({
    queryKey: ["public", "order-limits"],
    queryFn: customerApi.getOrderLimits,
    staleTime: 10 * 60_000,
    retry: 1,
  });
  useEffect(() => {
    if (data) setQtyCap(data.maxQtyPerProduct);
  }, [data]);
  return data;
}
