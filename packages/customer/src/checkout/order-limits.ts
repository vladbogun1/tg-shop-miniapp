"use client";

/**
 * Лимиты антиспама (GET /api/public/order-limits; админка «Настройки» → «Защита от ботов и спама»).
 * Хук читает их раз в 10 минут и отдаёт серверный предел количества стору корзины (`setQtyCap`): шаговые счётчики
 * останавливаются на нём, поэтому оформление не отказывает по QTY_LIMIT для корзины, собранной здесь. 0 = без лимита.
 * Предел самого счётчика — `maxQty` из @shop/core.
 */
import type { OrderLimits } from "@shop/core/types";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type { CheckoutApi } from "./api";
import { checkoutKeys, DIRECTORY_STALE_MS } from "./keys";

export function useOrderLimits(
  api: Pick<CheckoutApi, "orderLimits">,
  /** Стор корзины приложения: `cart.setQtyCap`. */
  setQtyCap: (n: number) => void,
): OrderLimits | undefined {
  const { data } = useQuery({
    queryKey: checkoutKeys.orderLimits(),
    queryFn: api.orderLimits,
    staleTime: DIRECTORY_STALE_MS,
    retry: 1,
  });
  useEffect(() => {
    if (data) setQtyCap(data.maxQtyPerProduct);
  }, [data, setQtyCap]);
  return data;
}
