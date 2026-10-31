"use client";

/** Запросы и записи модалок карточки заказа: кейс-подарок, скидка, слияние. */
import { QUERY_PRESETS } from "@shop/core/query";
import { useApiMutation } from "@shop/ui/mutation";
import { useQuery } from "@tanstack/react-query";
import { giftApi } from "@/features/gift";
import { orderApi, type AdminOrderDetail, type DiscountBody } from "../api";
import { orderKeys } from "../keys";

/** Какие кейсы сейчас есть чем разыграть (у кейса без призов кнопка выключена). */
export function useGiftTiersQuery(enabled: boolean) {
  return useQuery({
    queryKey: orderKeys.giftTiers(),
    queryFn: giftApi.tiers,
    enabled,
    staleTime: QUERY_PRESETS.list.staleTime,
  });
}

/** Другие неотправленные заказы покупателя для «Объединить» (сервер сам пишет, почему какой нельзя). */
export function useMergeCandidatesQuery(orderId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: orderKeys.mergeCandidates(orderId),
    queryFn: () => orderApi.mergeCandidates(orderId as string),
    enabled,
  });
}

/** «Скидка»: применить код/сумму/процент или снять; `onApplied` — обновить списки и закрыть модалку. */
export function useApplyDiscountMutation(orderId: string | undefined, onApplied: () => void) {
  return useApiMutation<AdminOrderDetail, { body: DiscountBody; clear: boolean }>({
    mutationFn: ({ body }) => orderApi.applyDiscount(orderId as string, body),
    success: (_data, { clear }) => (clear ? "Скидка снята" : "Скидка применена"),
    errorFallback: "Не удалось применить скидку",
    onSuccess: onApplied,
  });
}
