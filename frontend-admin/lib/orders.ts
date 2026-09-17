/**
 * Order status metadata and transition rules.
 *
 * The rules themselves live in @shop/shared so the admin and the Mini App cannot disagree with
 * each other — or with the backend, which is what happened before (the admin refused NEW → SHIPPED
 * that the server accepts, and offered a "В новые" action the server always rejects).
 */
export {
  allowedTargets,
  canTransition,
  formatDateTime,
  ORDER_STATUS_COLOR as STATUS_VAR,
  PAYMENT_STATE_LABEL,
  paymentState,
  STATUS_COLUMN_LABEL as STATUS_LABEL,
  STATUS_EMOJI,
  STATUS_ORDER,
  shortOrderId as shortId,
  timeAgo,
  type PaymentState,
} from "@shop/shared";

import type { DeliveryMethod } from "@shop/shared";

export const DELIVERY_LABEL: Record<DeliveryMethod, string> = {
  NOVA_POSHTA: "Нова Пошта",
  PICKUP: "Самовывоз",
};
