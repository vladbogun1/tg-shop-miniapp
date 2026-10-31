"use client";

import { useApiMutation } from "@shop/ui/mutation";
import { useQuery } from "@tanstack/react-query";
import { promoApi } from "./api";
import { promoKeys } from "./keys";
import type { ManualDiscountOrder, PromoBody } from "./model/types";

/** Все коды; `enabled=false` — не грузить, пока окно закрыто (скидка в заказе). */
export function usePromocodes(enabled = true) {
  return useQuery({ queryKey: promoKeys.all(), queryFn: promoApi.list, enabled });
}

/** Ручные скидки не коды: старый бэкенд без эндпоинта — пустой список. */
export function useManualDiscounts() {
  return useQuery({
    queryKey: promoKeys.manual(),
    queryFn: () => promoApi.manualDiscounts().catch(() => [] as ManualDiscountOrder[]),
  });
}

export function usePromoOrders(id: string, enabled: boolean) {
  return useQuery({ queryKey: promoKeys.orders(id), queryFn: () => promoApi.orders(id), enabled });
}

/** Создать (`id` нет) или изменить код; список обновляется, остальное — в `onSaved`. */
export function useSavePromo(onSaved: (created: boolean) => void) {
  return useApiMutation({
    mutationFn: (v: { id: string | null; body: PromoBody }) => (v.id ? promoApi.update(v.id, v.body) : promoApi.create(v.body)),
    invalidate: [promoKeys.all()],
    success: "Сохранено",
    errorFallback: "Ошибка",
    onSuccess: (_r, v) => onSaved(!v.id),
  });
}

export function useDeletePromo(onDeleted: () => void) {
  return useApiMutation({
    mutationFn: (id: string) => promoApi.remove(id),
    invalidate: [promoKeys.all()],
    success: "Промокод удалён",
    errorFallback: "Ошибка",
    onSuccess: onDeleted,
  });
}
