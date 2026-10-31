/**
 * Эндпоинты оплаты: счета monobank заказа, чеки, ручная правка «получено», статус эквайринга,
 * способы оплаты. Единственное место с этими путями.
 */
import type { Receipt } from "@shop/core/receipts";
import type { PaymentOption } from "@shop/core/types";
import { apiGet, apiPatch, apiPost, apiPut } from "@/lib/http";
import { apiOrigin } from "@/lib/origin";
import type { MovementChannel } from "./model/movements";
import type { AdminInvoice, MonobankStatus, PaymentOptionFull, PaymentOrder } from "./model/types";

export type { Receipt };

export interface SetPaidBody {
  receivedMinor: number;
  channel?: MovementChannel;
  note?: string;
}

/** Тело сохранения способов оплаты. */
export type PaymentOptionWrite = Partial<Omit<PaymentOptionFull, "title" | "requiresPrepayment" | "prepaymentMinor">> &
  Pick<PaymentOptionFull, "title" | "requiresPrepayment"> & { prepaymentMinor?: number | null };

/** Подписанная ссылка на чек (`/api/receipts/file?…`) → абсолютная, на origin API. */
export function receiptHref(path: string | null | undefined): string | null {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : `${apiOrigin}${path.startsWith("/") ? "" : "/"}${path}`;
}

export const paymentApi = {
  /** PATCH …/paid — получено + как пришло (журнал денег). Возвращает обновлённый заказ. */
  setPaid: (orderId: string, body: SetPaidBody) => apiPatch<PaymentOrder>(`/api/admin/orders/${orderId}/paid`, body),
  /** GET …/payments — счета заказа, новые первыми. */
  orderPayments: (orderId: string) => apiGet<AdminInvoice[]>(`/api/admin/orders/${orderId}/payments`),
  /** POST …/payments/refresh — спросить monobank о текущем состоянии. */
  refreshOrderPayments: (orderId: string) => apiPost<AdminInvoice[]>(`/api/admin/orders/${orderId}/payments/refresh`),
  /**
   * POST …/payments/{invoiceId}/refund — деньги на карту; без `amountMinor` — всё, что осталось
   * (`refundPending`, пока monobank не подтвердит).
   */
  refundOrderPayment: (orderId: string, invoiceId: string, amountMinor?: number) =>
    apiPost<AdminInvoice[]>(
      `/api/admin/orders/${orderId}/payments/${encodeURIComponent(invoiceId)}/refund`,
      amountMinor === undefined ? {} : { amountMinor }
    ),
  /** GET …/receipts — фискальные чеки + квитанция банка по каждому оплаченному счёту. */
  orderReceipts: (orderId: string) => apiGet<Receipt[]>(`/api/admin/orders/${orderId}/receipts`),
  /** GET /api/admin/payments/monobank/status — токен, магазин, последний вебхук. */
  monobankStatus: () => apiGet<MonobankStatus>("/api/admin/payments/monobank/status"),
  /** Способы оплаты в порядке оформления; `all` — вместе с выключенными. */
  paymentOptionsAll: () => apiGet<PaymentOptionFull[]>("/api/admin/payment-options?includeInactive=true"),
  /** Только включённые — для ручного заказа. */
  paymentOptionsActive: () => apiGet<PaymentOption[]>("/api/admin/payment-options"),
  putPaymentOptions: (list: PaymentOptionWrite[]) => apiPut<PaymentOptionFull[]>("/api/admin/payment-options", list),
};
