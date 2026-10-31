"use client";

import { QUERY_PRESETS } from "@shop/core/query";
import { useApiMutation } from "@shop/ui/mutation";
import { useQuery } from "@tanstack/react-query";
import { productApi } from "@/features/product";
import { giftApi } from "@/features/gift";
import { orderApi, type AddItemBody } from "../api";
import { orderKeys } from "../keys";

/** Каталог для подбора позиции: ручной заказ и «Добавить в заказ». Ключ общий с экраном товаров. */
export function useProductPickQuery(enabled: boolean) {
  return useQuery({
    queryKey: orderKeys.products(),
    queryFn: () => productApi.list(),
    enabled,
  });
}

/** Месячный лимит подарков покупателя заказа: предупреждаем, не блокируем. Каждый раз свежий. */
export function useGiftLimitQuery(orderId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: orderKeys.giftLimit(orderId),
    queryFn: () => giftApi.limit(orderId as string),
    enabled: enabled && !!orderId,
    staleTime: QUERY_PRESETS.live.staleTime,
  });
}

/** Добавить позицию в заказ (платную или подарок); склад резервирует сервер. */
export function useAddOrderItem(orderId: string | null) {
  return useApiMutation({
    mutationFn: (body: AddItemBody) => orderApi.addItem(orderId as string, body),
    errorFallback: "Не удалось добавить",
    success: (_order, v) => (v.gift ? "Подарок добавлен 🎁" : "Товар добавлен в заказ"),
  });
}
