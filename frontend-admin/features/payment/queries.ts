"use client";

import { receiptsPollMs } from "@shop/core/receipts";
import { QUERY_PRESETS } from "@shop/core/query";
import { nowMs } from "@shop/core/time";
import { useApiMutation } from "@shop/ui/mutation";
import type { PaymentOption } from "@shop/core/types";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useRef } from "react";
import { paymentApi, type PaymentOptionWrite } from "./api";
import { paymentKeys } from "./keys";
import type { AdminInvoice, PaymentOptionFull } from "./model/types";

/** Пока возврат проводится, бэкенд опрашивает monobank; подхватываем его итог. */
const REFUND_POLL_MS = 15_000;

/**
 * Счета заказа. `pollRefunds` — для блока «Онлайн-оплата»: пока есть возврат в обработке, перечитывать;
 * остальным экранам (запрос отмены) опрос не нужен — тот же кэш.
 */
export function useOrderInvoicesQuery(orderId: string, opts: { pollRefunds?: boolean } = {}) {
  return useQuery({
    queryKey: paymentKeys.invoices(orderId),
    queryFn: () => paymentApi.orderPayments(orderId),
    ...(opts.pollRefunds
      ? { refetchInterval: (query: { state: { data?: AdminInvoice[] } }) => ((query.state.data ?? []).some((i) => i.refundPending) ? REFUND_POLL_MS : false) }
      : {}),
  });
}

/** Чеки оплаченных счетов; пока чек выпускается — перечитывается (см. receiptsPollMs). */
export function useOrderReceiptsQuery(orderId: string) {
  const since = useRef(nowMs());
  return useQuery({
    queryKey: paymentKeys.receipts(orderId),
    queryFn: () => paymentApi.orderReceipts(orderId),
    staleTime: QUERY_PRESETS.list.staleTime,
    refetchInterval: (query) => receiptsPollMs(query.state.data, since.current),
  });
}

export function useMonobankStatusQuery() {
  return useQuery({
    queryKey: paymentKeys.monobank(),
    queryFn: paymentApi.monobankStatus,
    staleTime: QUERY_PRESETS.list.staleTime,
  });
}

/** «all» — все способы с выключенными (настройки), «active» — включённые (ручной заказ). */
export function usePaymentOptionsQuery(variant: "all", opts?: { enabled?: boolean }): UseQueryResult<PaymentOptionFull[]>;
export function usePaymentOptionsQuery(variant: "active", opts?: { enabled?: boolean }): UseQueryResult<PaymentOption[]>;
export function usePaymentOptionsQuery(variant: "all" | "active", opts: { enabled?: boolean } = {}): UseQueryResult<unknown[]> {
  return useQuery({
    queryKey: paymentKeys.options(variant),
    queryFn: variant === "all" ? paymentApi.paymentOptionsAll : paymentApi.paymentOptionsActive,
    enabled: opts.enabled,
  });
}

/** «Обновить статус»: спросить monobank, ответ заменяет кэш счетов. */
export function useRefreshInvoices(orderId: string, onChanged?: () => void) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: () => paymentApi.refreshOrderPayments(orderId),
    success: "Статус оплаты обновлён",
    errorFallback: "Не удалось обновить статус",
    onSuccess: (fresh) => {
      qc.setQueryData(paymentKeys.invoices(orderId), fresh);
      onChanged?.();
    },
  });
}

/** «Вернуть деньги» по счёту: деньги на карту; без суммы — всё оставшееся. */
export function useRefundInvoice(orderId: string, onDone: () => void) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (v: { invoiceId: string; amountMinor: number | undefined }) =>
      paymentApi.refundOrderPayment(orderId, v.invoiceId, v.amountMinor),
    success: "Возврат отправлен в monobank — деньги придут на карту покупателя",
    errorFallback: "Не удалось оформить возврат",
    onSuccess: (fresh) => {
      qc.setQueryData(paymentKeys.invoices(orderId), fresh);
      onDone();
    },
  });
}

/** Сохранение способов оплаты; ответ сервера — новое содержимое формы (кэш не трогаем, как раньше). */
export function useSavePaymentOptions(onSaved: (saved: PaymentOptionFull[]) => void) {
  return useApiMutation({
    mutationFn: (list: PaymentOptionWrite[]) => paymentApi.putPaymentOptions(list),
    success: "Способы оплаты сохранены",
    errorFallback: "Не удалось сохранить",
    onSuccess: onSaved,
  });
}
