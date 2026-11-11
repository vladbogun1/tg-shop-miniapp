/**
 * Контракт checkout v2 «Нової пошти» для покупательских фронтов — в ОДНОМ месте, остальной код только импортирует.
 *
 * Заказ, посылка и вариант оплаты — алиасы на OpenAPI (`generated.d.ts`, коммит np-contract-order).
 * Справочники НП для оформления (config / streets / estimate) — пока ручные формы: их контракт придёт
 * с np-contract-delivery (feat/np-v2-be-delivery), тогда здесь же меняются на `Schemas["…"]`.
 * Поля варианта оплаты необязательны: при откате на старый бэкенд оформление работает без них.
 */
import type { Schemas } from "@shop/core/api/schemas";
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

/** Вариант оплаты с полями checkout v2 (PaymentOptionDto; старый бэкенд их не шлёт). `kind` "ON_DELIVERY" — оплата при
 * получении; `deliveryMethods` пусто — для всех доставок; `maxTotalMinor` 0/нет — без лимита. */
export type NpPaymentOption = PaymentOption & Partial<Pick<Schemas["PaymentOptionDto"], "kind" | "deliveryMethods" | "maxTotalMinor">>;

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

/** Посылка заказа глазами покупателя (OrderDetailDto.shipment). */
export type ParcelInfo = Schemas["ShipmentBrief"];

/** Поля checkout v2 в деталях заказа (необязательны: старый бэкенд и прошлые заказы). */
export type OrderNpFields = Partial<Pick<
  Schemas["OrderDetailDto"],
  | "npServiceType"
  | "npStreetName"
  | "npBuilding"
  | "npFlat"
  | "recipientLastName"
  | "recipientFirstName"
  | "recipientMiddleName"
  | "paymentOnDelivery"
  | "shipment"
>>;

/** Детали заказа с полями checkout v2. */
export type NpOrderDetail = OrderDetail;

/** Строка списка заказов с ТТН и стадией посылки. */
export type NpOrderSummary = OrderSummary;
