"use client";

import { errorMessage } from "@shop/core/errors";
import { useApiMutation } from "@shop/ui/mutation";
import { orderApi, type AdminCreateOrderBody } from "../api";
import { orderKeys } from "../keys";

/** Ручной заказ: цены, склад и промокод проверяет сервер, его текст ошибки показываем и в окне, и тостом. */
export function useCreateOrder(onCreated: (orderId: string) => void, onFail: (message: string) => void) {
  return useApiMutation({
    mutationFn: (body: AdminCreateOrderBody) => orderApi.create(body),
    success: "Заказ создан",
    invalidate: [orderKeys.board(), orderKeys.table(), orderKeys.inbox()],
    onSuccess: (order) => onCreated(order.id),
    onError: (e) => onFail(errorMessage(e, undefined, "Не удалось создать заказ")),
  });
}
