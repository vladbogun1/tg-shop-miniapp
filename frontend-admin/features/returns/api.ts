/**
 * Эндпоинты возвратов, обмена и возврата на склад. Единственное место с этими путями.
 * Ответ на запись заказа — карточка заказа целиком (`OrderDetailDto`).
 */
import { apiPost } from "@/lib/http";
import type { MovementChannel } from "@/features/payment";
import type { ReturnLineOutcome, ReturnOrder } from "./model/types";

/** Куда уходит возвращённая единица: на полку, в брак или остаётся у покупателя (компенсация). */
export type ReturnOutcome = ReturnLineOutcome;
export type ExchangeOutcome = Exclude<ReturnOutcome, "KEPT">;
/** Что будет с деньгами возврата при его отмене. */
export type CancelMoney = "RETURNED" | "DEBT" | "KEEP";

/** POST …/returns — мастер возврата. */
export interface ReturnWizardBody {
  lines: { itemId: number; quantity: number; outcome: ReturnOutcome }[];
  /** Возвраты вручную; monobank здесь НЕ канал — это monoRefundMinor. */
  refunds: { channel: MovementChannel; amountMinor: number; note?: string }[];
  monoRefundMinor: number;
  retainMinor: number;
  note?: string;
  notifyCustomer: boolean;
}

/** POST …/return-received — отказная посылка вернулась (всё кроме DEFECT идёт на полку). */
export interface ReturnReceivedBody {
  lines: { itemId: number; quantity: number; outcome: "RESTOCK" | "DEFECT" }[];
  note?: string;
}

export interface ExchangeBody {
  /** IN_TRANSIT = отправлено почтой («Едет назад»); RESTOCK / DEFECT = уже в магазине. */
  returned: { itemId: number; quantity: number; outcome: ExchangeOutcome }[];
  items: { productId: string; variantId?: string; quantity: number }[];
  targetStatus: "NEW" | "APPROVED";
  notifyCustomer: boolean;
  note?: string;
}

/** Код бэкенда: банк отказал в возврате уже после того, как сам возврат сохранён. */
export const MONO_REFUND_FAILED_CODE = "MONO_REFUND_FAILED";

export const returnsApi = {
  /** POST /api/admin/orders/{id}/returns — мастер возврата (товар + деньги + удержание). */
  registerReturn: (id: string, body: ReturnWizardBody) => apiPost<ReturnOrder>(`/api/admin/orders/${id}/returns`, body),

  /** POST …/return-received — посылка, ушедшая назад, пришла. */
  receiveReturn: (id: string, body: ReturnReceivedBody) =>
    apiPost<ReturnOrder>(`/api/admin/orders/${id}/return-received`, body),

  /** POST …/returns/{rid}/cancel — покупатель передумал: единицы обратно в заказ. */
  cancelReturn: (id: string, returnId: number, body: { money?: CancelMoney; note: string }) =>
    apiPost<ReturnOrder>(`/api/admin/orders/${id}/returns/${returnId}/cancel`, body),

  /** POST …/returns/{rid}/debt-paid — деньги отменённого возврата вернулись. */
  returnDebtPaid: (id: string, returnId: number) =>
    apiPost<ReturnOrder>(`/api/admin/orders/${id}/returns/${returnId}/debt-paid`, {}),

  /** POST …/exchange — замена товара в оплаченном заказе, обратно в NEW для новой ТТН. */
  exchange: (id: string, body: ExchangeBody) => apiPost<ReturnOrder>(`/api/admin/orders/${id}/exchange`, body),

  /** POST /api/admin/stock-writeoffs/{id}/restore — списали по ошибке, вернуть на полку. */
  restoreWriteoff: (id: number, quantity: number, note: string) =>
    apiPost<{ summary: string }>(`/api/admin/stock-writeoffs/${id}/restore`, {
      quantity,
      note,
    }),
};
