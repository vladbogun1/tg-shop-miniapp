/**
 * Модель оформления заказа без React: проверка полей, тело запроса `POST /api/orders`, разбор отказа сервера.
 * Одинаково в Mini App и на сайте; различия экранов (шаги против одной страницы) остаются в экранах.
 */
import { ApiError } from "@shop/core/errors";
import { isOrderLimitCode, type OrderLimitCode } from "@shop/core/orders";
import { phoneE164 } from "@shop/core/phone";
import type { DeliveryMethod, NpWarehouse } from "@shop/core/types";
import type { CreateOrderRequest } from "./api";

/** Имя получателя: не короче двух символов без пробелов по краям. */
export function isValidCustomerName(name: string): boolean {
  return name.trim().length >= 2;
}

export interface OrderLineInput {
  productId: string;
  variantId: string | null;
  quantity: number;
}

export interface OrderRequestInput {
  /** Только то, что можно заказать (сайт отфильтровал строки без остатка заранее). */
  lines: OrderLineInput[];
  name: string;
  phone: string;
  comment: string;
  /** Промокод, который сервер только что подтвердил. Отклонённый код не отправляется никогда. */
  promoCode: string | undefined;
  delivery: DeliveryMethod;
  warehouse: NpWarehouse | null;
  paymentOptionId: string;
  /** Подарок за сумму: достигнут ли уровень и выбрана ли скидка. `undefined` — уровня нет. */
  giftChoice: "CASE" | "DISCOUNT" | undefined;
}

export function buildCreateOrderRequest(input: OrderRequestInput): CreateOrderRequest {
  const np = input.delivery === "NOVA_POSHTA";
  const w = input.warehouse;
  return {
    items: input.lines.map((l) => ({ productId: l.productId, variantId: l.variantId ?? undefined, quantity: l.quantity })),
    customerName: input.name.trim(),
    phone: phoneE164(input.phone),
    comment: input.comment.trim() || undefined,
    promoCode: input.promoCode,
    deliveryMethod: input.delivery,
    npCityRef: np ? (w?.cityRef ?? undefined) : undefined,
    npCityName: np ? (w?.cityName ?? undefined) : undefined,
    npWarehouseRef: np ? w?.ref : undefined,
    npWarehouseName: np ? w?.description : undefined,
    paymentOptionId: input.paymentOptionId,
    giftChoice: input.giftChoice,
  };
}

/** Отказ при оформлении: что показать и что сделать с состоянием экрана. */
export type OrderFailure =
  /** Кто-то занял последнее использование кода: код снимается, текст — «{message}. Промокод прибрано…». */
  | { kind: "promoRejected"; message: string }
  /** Лимит антиспама (TOO_MANY_UNPAID → ссылка на «Мои заказы»): текст сервера говорит, что делать. */
  | { kind: "limit"; code: OrderLimitCode; message: string }
  /** Сервер отклонил одно поле запроса (400 без кода, текст «поле: сообщение») — показать у поля. */
  | { kind: "field"; field: OrderField }
  /** Остальное: текст сервера, а без него — общий текст экрана (`message: null`). */
  | { kind: "other"; message: string | null };

export type OrderField = "name" | "phone" | "comment";

const SERVER_FIELDS: Record<string, OrderField> = { customerName: "name", phone: "phone", comment: "comment" };

/** «customerName: must not be blank» от валидации Spring → поле формы. Сообщение сервера людям не показываем. */
export function serverFieldOf(e: unknown): OrderField | null {
  const name = validationFieldName(e);
  return (name && SERVER_FIELDS[name]) || null;
}

/** Имя поля из текста валидации «поле: сообщение» (400 без кода), иначе null. */
function validationFieldName(e: unknown): string | null {
  if (!(e instanceof ApiError) || e.status !== 400 || e.code) return null;
  return /^(\w+): /.exec(e.message)?.[1] ?? null;
}

export function classifyOrderFailure(e: unknown): OrderFailure {
  const field = serverFieldOf(e);
  if (field) return { kind: "field", field };
  // Другое поле валидации («items: …»): сырой текст Spring покупателю не показываем.
  if (validationFieldName(e)) return { kind: "other", message: null };
  if (e instanceof ApiError && e.code === "PROMO_REJECTED") return { kind: "promoRejected", message: e.message };
  if (e instanceof ApiError && isOrderLimitCode(e.code)) return { kind: "limit", code: e.code, message: e.message };
  return { kind: "other", message: e instanceof ApiError ? e.message : null };
}
