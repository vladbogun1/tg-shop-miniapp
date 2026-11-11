/**
 * Контракт checkout v2 «Нової пошти» (ветка np-integration), пока его нет в OpenAPI master.
 *
 * ВРЕМЕННО и в ОДНОМ месте: когда бэкенд (feat/np-v2-be-order, feat/np-v2-be-delivery) положит контракт в
 * `packages/core/src/api/generated.d.ts`, эти формы заменяются алиасами на `Schemas["…"]` здесь же — остальной код
 * их только импортирует. Поля заказа/варианта оплаты описаны как НЕобязательные добавки к текущим типам:
 * старый бэкенд их не шлёт, и оформление обязано работать без них (все вкладки, без подсказки цены, без «при отриманні»).
 */
import type { OrderDetail, OrderSummary, PaymentOption } from "@shop/core/types";

/** Служба «Нової пошти» в заказе: відділення, поштомат, кур'єр. */
export type NpServiceType = "WAREHOUSE" | "POSTOMAT" | "DOORS";

/** С чем сверяется список способов доставки варианта оплаты: служба НП или самовывоз. */
export type DeliveryKey = NpServiceType | "PICKUP";

/** GET /api/np/config — какие службы включены в магазине (сервер всё равно проверит при заказе). */
export interface NpCheckoutConfig {
  postomatEnabled: boolean;
  courierEnabled: boolean;
  estimateEnabled: boolean;
}

/** GET /api/np/streets?cityRef&q — улица города для курьера; `ref` уходит в заказ. */
export interface NpStreet {
  ref: string;
  name: string;
  type?: string | null;
}

/** Тело POST /api/np/estimate. */
export interface NpEstimateRequest {
  cityRef: string;
  serviceType: NpServiceType;
  items: { productId: string; variantId?: string; quantity: number }[];
  totalMinor: number;
  payOnDeliveryMinor: number;
}

/** Ответ POST /api/np/estimate: `available: false` — подсказки нет. */
export interface NpEstimateResponse {
  available: boolean;
  /** Доставка + коробка + комиссия за перевод (если есть): всё, что платят НП при получении, кроме товара. */
  deliveryMinor?: number | null;
  /** Комиссия «Контроль оплати», уже входящая в `deliveryMinor`; 0 — заказ оплачен онлайн целиком. */
  codFeeMinor?: number | null;
}

/** Вид варианта оплаты: null — онлайн; ON_DELIVERY — всё собирает «Нова пошта» при получении. */
export type PaymentOptionKind = "ON_DELIVERY";

/** Вариант оплаты с полями checkout v2 (старый бэкенд их не шлёт). */
export type NpPaymentOption = PaymentOption & {
  kind?: PaymentOptionKind | null;
  /** Для каких доставок предлагается; пусто/нет — для всех. */
  deliveryMethods?: DeliveryKey[] | null;
  /** Самая большая сумма заказа, minor; null/нет — без лимита. */
  maxTotalMinor?: number | null;
};

/** Где посылка (ShipmentStage бэкенда). */
export type ShipmentStage =
  | "CREATED"
  | "IN_TRANSIT"
  | "ARRIVED"
  | "RECEIVED"
  | "REFUSED"
  | "RETURNING"
  | "CANCELLED"
  | "NOT_FOUND";

/** Посылка заказа глазами покупателя (OrderDetail.shipment). */
export interface ParcelInfo {
  ttn: string;
  serviceType?: string | null;
  stage: string;
  statusText?: string | null;
  scheduledDelivery?: string | null;
  arrivedAt?: string | null;
  receivedAt?: string | null;
  storagePaidFrom?: string | null;
  codMinor?: number | null;
  deliveryCostMinor?: number | null;
  trackingUrl?: string | null;
}

/** Поля checkout v2 в деталях заказа. */
export interface OrderNpFields {
  npServiceType?: string | null;
  npStreetName?: string | null;
  npBuilding?: string | null;
  npFlat?: string | null;
  recipientLastName?: string | null;
  recipientFirstName?: string | null;
  recipientMiddleName?: string | null;
  paymentOnDelivery?: boolean | null;
  shipment?: ParcelInfo | null;
}

/** Детали заказа с полями checkout v2. */
export type NpOrderDetail = OrderDetail & OrderNpFields;

/** Строка списка заказов с ТТН и стадией посылки. */
export type NpOrderSummary = OrderSummary & {
  trackingNumber?: string | null;
  shipmentStage?: string | null;
  trackingUrl?: string | null;
};
