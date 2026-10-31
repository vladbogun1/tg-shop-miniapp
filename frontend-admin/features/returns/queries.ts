"use client";

import { productApi } from "@/features/product";
import { money } from "@/lib/money";
import { shortOrderId } from "@shop/core/format";
import { useApiMutation } from "@shop/ui/mutation";
import { useQuery } from "@tanstack/react-query";
import { returnsApi, type CancelMoney, type ExchangeBody, type ReturnReceivedBody, type ReturnWizardBody } from "./api";
import { returnsKeys } from "./keys";
import type { ReturnOrder } from "./model/types";

/** Что делает вызывающий после успеха: обновить карточку заказа и списки (кэш заказа принадлежит фиче order). */
interface OrderWriteOpts {
  onSuccess?: (order: ReturnOrder) => void;
}

/** Список товаров для подбора замены; тот же кэш, что у «Товаров». Грузится, пока открыто окно обмена. */
export function useExchangeProductsQuery(open: boolean) {
  return useQuery({
    queryKey: returnsKeys.products(),
    queryFn: () => productApi.list(),
    enabled: open,
  });
}

/** Мастер возврата. Ошибка (в том числе MONO_REFUND_FAILED — банк отказал до сохранения) → тост, окно остаётся открытым. */
export function useRegisterReturn(orderId: string, opts: OrderWriteOpts = {}) {
  return useApiMutation({
    mutationFn: (body: ReturnWizardBody) => returnsApi.registerReturn(orderId, body),
    invalidate: [returnsKeys.products()],
    success: "Возврат оформлен",
    errorFallback: "Не удалось оформить возврат",
    onSuccess: (order) => opts.onSuccess?.(order),
  });
}

/** «Посылка вернулась»: всё кроме брака — на полку. */
export function useReceiveReturn(orderId: string, opts: OrderWriteOpts = {}) {
  return useApiMutation({
    mutationFn: (body: ReturnReceivedBody) => returnsApi.receiveReturn(orderId, body),
    invalidate: [returnsKeys.products()],
    success: "Посылка принята, товар на складе",
    errorFallback: "Ошибка",
    onSuccess: (order) => opts.onSuccess?.(order),
  });
}

/** Обмен: ответ — новый заказ-замена («Обмен к #…»). */
export function useExchange(orderId: string, opts: OrderWriteOpts = {}) {
  return useApiMutation({
    mutationFn: (body: ExchangeBody) => returnsApi.exchange(orderId, body),
    invalidate: [returnsKeys.products()],
    success: (child, body) =>
      `Обмен оформлен — создан заказ ${shortOrderId(child.id)}${body.targetStatus === "APPROVED" ? ", ждёт отправки" : " в «Новых»"}`,
    errorFallback: "Ошибка",
    onSuccess: (child) => opts.onSuccess?.(child),
  });
}

/** Покупатель передумал: единицы обратно в заказ, деньги — по выбору (вернул / долг / оставляем). */
export function useCancelReturn(orderId: string, onDone: () => void) {
  return useApiMutation({
    mutationFn: (v: { returnId: number; exchange: boolean; money?: CancelMoney; note: string }) =>
      returnsApi.cancelReturn(orderId, v.returnId, {
        money: v.money,
        note: v.note,
      }),
    success: (_order, v) =>
      v.exchange ? "Обмен отменён, товар снова в заказе" : "Возврат отменён, товар снова в заказе",
    errorFallback: "Не удалось отменить",
    onSuccess: () => onDone(),
  });
}

/** «Деньги пришли»: долг отменённого возврата вернулся. */
export function useReturnDebtPaid(orderId: string, currency: string, onDone: () => void) {
  return useApiMutation({
    mutationFn: (v: { returnId: number; debtMinor: number }) => returnsApi.returnDebtPaid(orderId, v.returnId),
    success: (_order, v) => `${money(v.debtMinor, currency)} записали как полученные`,
    errorFallback: "Не удалось записать деньги",
    onSuccess: () => onDone(),
  });
}

/** «Вернуть на склад» из списаний по ошибке. */
export function useRestoreWriteoff(onDone: () => void) {
  return useApiMutation({
    mutationFn: (v: { id: number; title: string; quantity: number; note: string }) =>
      returnsApi.restoreWriteoff(v.id, v.quantity, v.note),
    success: (_r, v) => `${v.title} ×${v.quantity} — снова на складе`,
    errorFallback: "Не удалось вернуть на склад",
    onSuccess: () => onDone(),
  });
}
