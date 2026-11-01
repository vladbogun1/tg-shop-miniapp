/**
 * Публичный вход фичи «заказ»: доска, таблица, ручной заказ, карточка заказа. Остальные фичи и страницы
 * берут отсюда, а не из внутренних папок (dependency-cruiser: features-via-index).
 */
export { OrdersScreen } from "./ui/OrdersScreen";
export { OrderDeepLinkScreen } from "./ui/OrderDeepLinkScreen";
export { OrderDrawer } from "./ui/drawer/OrderDrawer";

export { orderApi, changeStatusConfirmingUnpaid } from "./api";
export type { AdminBoard, AdminDispatchOrder, AdminOrderCard, AdminOrderDetail } from "./api";
export { orderKeys } from "./keys";
export {
  DELIVERY_LABEL,
  REJECT_REASON_LABEL,
  STATUS_LABEL,
  STATUS_VAR,
  isNovaPoshtaTtn,
  shortId,
  type RejectReasonCode,
} from "./model/status";
