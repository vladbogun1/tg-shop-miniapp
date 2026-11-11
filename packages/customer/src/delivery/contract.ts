/**
 * Контракт checkout v2 «Нової пошти» для покупательских фронтов — в ОДНОМ месте, остальной код только импортирует.
 *
 * Заказ, посылка, вариант оплаты и справочники НП для оформления (config / streets / estimate) — алиасы на OpenAPI
 * (`generated.d.ts`, коммиты np-contract-order и np-contract-delivery).
 * Поля варианта оплаты необязательны: при откате на старый бэкенд оформление работает без них.
 */
import type { Schemas } from "@shop/core/api/schemas";
import type { OrderDetail, OrderSummary, PaymentOption } from "@shop/core/types";

/** Служба «Нової пошти» в заказе: відділення, поштомат, кур'єр. */
export type NpServiceType = "WAREHOUSE" | "POSTOMAT" | "DOORS";

/** С чем сверяется список способов доставки варианта оплаты: служба НП или самовывоз. */
export type DeliveryKey = NpServiceType | "PICKUP";

/** GET /api/np/config — какие службы включены в магазине (сервер всё равно проверит при заказе). */
export type NpCheckoutConfig = Schemas["CheckoutConfig"];

/** GET /api/np/streets?cityRef&q — улица города для курьера; `ref` уходит в заказ. */
export type NpStreet = Schemas["Street"];

/**
 * Тело POST /api/np/estimate. В схеме все поля необязательны и служба — строка; клиент всегда шлёт всё,
 * поэтому здесь поля обязательные и служба — наш союз.
 */
export type NpEstimateRequest = Required<Omit<Schemas["DeliveryNpCheckoutEstimateRequest"], "serviceType">> & { serviceType: NpServiceType };

/**
 * Ответ POST /api/np/estimate: `available: false` — подсказки нет. `deliveryMinor` — доставка + коробка + комиссия за
 * перевод (если есть); `codFeeMinor` — комиссия «Контроль оплати», уже входящая в `deliveryMinor` (0 — оплачено онлайн).
 */
export type NpEstimateResponse = Schemas["EstimateResponse"];

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
