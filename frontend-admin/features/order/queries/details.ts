"use client";

/** Вкладки «Детали» и «История»: журнал, прибыль, запрос отмены. */
import { ApiError } from "@shop/core/errors";
import { useApiMutation } from "@shop/ui/mutation";
import { useQuery } from "@tanstack/react-query";
import { costingApi, procurementKeys } from "@/features/procurement";
import { paymentApi, paymentKeys } from "@/features/payment";
import { orderApi, type AdminOrderDetail, type CancelApproveResult } from "../api";
import { orderKeys } from "../keys";

export function useOrderAuditQuery(orderId: string) {
  return useQuery({
    queryKey: orderKeys.audit(orderId),
    queryFn: () => orderApi.orderAudit(orderId),
  });
}

/** Прибыль заказа; `enabled` — только при праве «Финансы» (иначе запрос не уходит). */
export function useOrderProfitQuery(orderId: string, enabled: boolean) {
  return useQuery({
    queryKey: procurementKeys.order(orderId),
    queryFn: () => costingApi.order(orderId),
    enabled: enabled && !!orderId,
    retry: false,
  });
}

/** Счета заказа для суммы возврата; тот же кэш, что у блока «Онлайн-оплата». Читаем, пока запрос отмены ждёт решения. */
export function useCancelRequestInvoicesQuery(orderId: string, enabled: boolean) {
  return useQuery({
    queryKey: paymentKeys.invoices(orderId),
    queryFn: () => paymentApi.orderPayments(orderId),
    enabled,
  });
}

interface CancelCallbacks {
  /** Закрыть окно. */
  onClose: () => void;
  /** Освежить счета и карточку (после успеха и после отказа сервера с кодом). */
  onDone: () => void;
}

/** «Одобрить и вернуть деньги»: тост зависит от того, что вернул сервер. */
export function useApproveCancelMutation(
  order: Pick<AdminOrderDetail, "id">,
  toasts: (r: CancelApproveResult) => void,
  cb: CancelCallbacks,
) {
  return useApiMutation<CancelApproveResult>({
    mutationFn: () => orderApi.approveCancelRequest(order.id),
    errorFallback: "Не удалось одобрить запрос",
    onSuccess: (r) => {
      cb.onClose();
      toasts(r);
      cb.onDone();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code) cb.onDone();
    },
  });
}

export function useDeclineCancelMutation(order: Pick<AdminOrderDetail, "id">, cb: CancelCallbacks) {
  return useApiMutation<AdminOrderDetail, string>({
    mutationFn: (comment) => orderApi.declineCancelRequest(order.id, comment),
    success: "Запрос отклонён, покупатель получил ваш комментарий",
    errorFallback: "Не удалось отклонить запрос",
    onSuccess: () => {
      cb.onClose();
      cb.onDone();
    },
  });
}
