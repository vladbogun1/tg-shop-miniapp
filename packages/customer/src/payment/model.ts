/**
 * Оплата заказа (monobank) без React: что считается «платёж в пути», ритм перечитывания и разбор отказа
 * `POST /api/me/orders/{id}/payment`. Как открывать страницу оплаты — у приложений: Mini App открывает её в настоящем
 * браузере телефона (Google Pay/Apple Pay не работают внутри Telegram), сайт показывает форму во фрейме поверх страницы.
 * Сама страница заказа с блоком оплаты — шаг 5c.
 */
import { ApiError } from "@shop/core/errors";
import { needsTopUp, paymentState } from "@shop/core/orders";
import type { OnlinePaymentStatus, OrderDetail } from "@shop/core/types";

/** Счёт, который ещё может стать деньгами. */
export const PENDING: readonly OnlinePaymentStatus[] = ["created", "processing", "hold"];
/** Банк получил данные карты и решает — новая попытка сейчас бессмысленна. */
export const IN_FLIGHT: readonly OnlinePaymentStatus[] = ["processing", "hold"];

/** После возврата со страницы банка заказ перечитывается раз в 3 с, не дольше минуты. */
export const POLL_EVERY_MS = 3_000;
export const POLL_FOR_MS = 60_000;

/** Заказ ждёт онлайн-оплаты (всей суммы, предоплаты или доплаты), и онлайн-оплата включена на сервере. */
export function awaitingOnline(o: OrderDetail): boolean {
  return (paymentState(o) === "AWAITING" || needsTopUp(o)) && o.payment.enabled;
}

/** Ждёт оплаты и счёт ещё в пути. */
export function pendingPayment(o: OrderDetail): boolean {
  return awaitingOnline(o) && PENDING.includes(o.payment.status);
}

export interface PaymentStartFailure {
  /** PAYMENT_IN_PROGRESS | PAYMENT_UNAVAILABLE | NOT_PAYABLE | PAYMENT_EXPIRED | PAYMENT_FAILED | … */
  code: string | undefined;
  /** Текст сервера; без него экран показывает свой общий текст. */
  message: string | null;
}

export function paymentStartFailure(e: unknown): PaymentStartFailure {
  return e instanceof ApiError ? { code: e.code, message: e.message } : { code: undefined, message: null };
}
