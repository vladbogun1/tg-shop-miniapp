/** Подписи журнала «Бот и сайт»: неизвестный код показывается как есть. */
import type { ActivityRow } from "./types";

export const SOURCE_LABEL: Record<string, string> = {
  BOT: "Бот",
  SITE: "Сайт",
  MINIAPP: "Mini App",
  PAYMENT: "Оплата",
  SYSTEM: "Система",
};

export const SOURCE_ORDER: string[] = ["BOT", "SITE", "MINIAPP", "PAYMENT", "SYSTEM"];

export const RESULT_LABEL: Record<string, string> = {
  OK: "Успешно",
  FAILED: "Ошибка",
  SKIPPED: "Пропущено",
};

/** For bot messages «Ошибка» reads better as «Не доставлено». */
export function resultLabel(result: string, source?: string): string {
  if (source === "BOT") {
    if (result === "OK") return "Доставлено";
    if (result === "FAILED") return "Не доставлено";
    if (result === "SKIPPED") return "Не отправлено";
  }
  return RESULT_LABEL[result] ?? result;
}

export const RECIPIENT_LABEL: Record<string, string> = {
  CUSTOMER: "Покупателю",
  ADMINS: "Админам",
};

export const TYPE_LABEL: Record<string, string> = {
  // --- bot → customer
  START: "Приветствие /start",
  HELP: "Справка /help",
  ORDER_STATUS: "Статус заказа",
  ORDER_GIFT: "Подарок в заказе",
  ORDER_DISCOUNT: "Скидка в заказе",
  ORDER_CHANGED: "Заказ изменён",
  ORDER_TRACKING: "Новая ТТН",
  ORDER_EXCHANGE: "Обмен оформлен",
  ORDER_MERGE: "Заказы объединены",
  CHAT_REPLY: "Ответ в чате заказа",
  PAYMENT_RECEIVED: "«Оплату отримано»",
  RECEIPT: "Чек PDF",
  CANCEL_REQUEST_APPROVED: "Отмена одобрена",
  CANCEL_REQUEST_DECLINED: "Отмена отклонена",
  SUPPORT_REPLY: "Ответ поддержки",
  REVIEW_REMINDER: "Напоминание об отзыве",
  REVIEW_BONUS_EXPIRING: "Бонус скоро сгорит",
  REVIEW_BONUS: "Бонус за отзыв",
  BROADCAST: "Рассылка",
  BROADCAST_TEST: "Тест рассылки",
  LOGIN_PROMPT: "Код входа на сайт",
  LOGIN_DONE: "«Вы вошли на сайт»",
  LOGIN_EXPIRED: "Вход: ссылка устарела",
  // --- bot → admins
  ADMIN_ORDER_CARD: "Карточка заказа",
  ADMIN_DISPATCH_CARD: "Карточка «К отправке»",
  ADMIN_CHAT_PING: "Сообщение покупателя",
  ADMIN_PAYMENT: "Оплата онлайн",
  ADMIN_CANCEL_REQUEST: "Запрос отмены",
  ADMIN_SUPPORT_PING: "Вопрос в поддержку",
  ADMIN_INVITE: "Приглашение админа",
  ADMIN_NOTICE: "Уведомление админу",
  ADMIN_SECURITY_ALERT: "Оповещение безопасности",
  // --- site / Mini App
  REGISTERED: "Новый пользователь",
  LOGIN: "Вход на сайт",
  LOGIN_CONFIRMED: "Вход подтверждён",
  LOGIN_REJECTED: "«Это не я»",
  SESSION_ENDED: "Сеанс завершён",
  ORDER_CREATED: "Заказ оформлен",
  ORDER_FAILED: "Заказ не оформлен",
  PROMO_APPLIED: "Промокод принят",
  LOCALE_CHANGED: "Смена языка",
  PAYMENT_START_FAILED: "Оплата не открылась",
  ORDER_CANCELLED: "Отмена покупателем",
  ORDER_CANCEL_FAILED: "Отмена не прошла",
  CANCEL_REQUESTED: "Заявка на отмену",
  CANCEL_REQUEST_FAILED: "Заявка не принята",
  CHAT_MESSAGE: "Сообщение в чат заказа",
  SUPPORT_REQUEST: "Вопрос в поддержку",
  SUPPORT_MESSAGE: "Сообщение в поддержку",
  REVIEW_SUBMITTED: "Отзыв",
  REVIEW_FAILED: "Отзыв не принят",
  // --- payment
  INVOICE_CREATED: "Счёт создан",
  INVOICE_CREATE_FAILED: "Счёт не создан",
  PAYMENT_SUCCESS: "Оплата прошла",
  PAYMENT_FAILURE: "Оплата не прошла",
  INVOICE_EXPIRED: "Счёт истёк",
  REFUND: "Возврат на карту",
  AMOUNT_MISMATCH: "Чужая сумма",
  WEBHOOK_REJECTED: "Вебхук отклонён",
  // --- system
  ORDER_AUTO_CANCELLED: "Автоотмена",
  ADMIN_PUSH: "Push админам",
};

export const ERROR_LABEL: Record<string, string> = {
  BOT_BLOCKED: "Бот заблокирован",
  USER_DEACTIVATED: "Аккаунт удалён",
  NOT_STARTED: "Не запускал бота",
  CHAT_NOT_FOUND: "Чат не найден",
  BOT_KICKED: "Бот удалён из чата",
  RATE_LIMITED: "Лимит Telegram (429)",
  BAD_MARKUP: "Ошибка разметки",
  TOPIC_NOT_FOUND: "Тема не найдена",
  FORBIDDEN: "Доступ запрещён (403)",
  BAD_REQUEST: "Неверный запрос (400)",
  NETWORK: "Сеть / таймаут",
  ERROR: "Ошибка",
  BAD_RECIPIENT: "Неверный получатель",
  NOTIFICATIONS_OFF: "Уведомления выключены",
  NO_DEVICES: "Нет устройств",
  PUSH_FAILED: "Push не доставлен",
  EXPIRED: "Истёк",
  AMOUNT_MISMATCH: "Сумма не совпала",
  BAD_SIGNATURE: "Неверная подпись",
  MONOBANK_ERROR: "Ошибка monobank",
  PAYMENT_EXPIRED: "Время на оплату вышло",
  PAYMENT_IN_PROGRESS: "Оплата уже идёт",
  PAYMENT_FAILED: "monobank недоступен",
  PAYMENT_UNAVAILABLE: "Оплата выключена",
  NOT_PAYABLE: "Нечего оплачивать",
  PAID_NEEDS_REQUEST: "Оплачен — нужна заявка",
  CANNOT_CANCEL: "Уже нельзя отменить",
  CANCEL_REQUEST_EXISTS: "Заявка уже есть",
  CANCEL_REQUEST_UNPAID: "Не оплачен",
  PROMO_REJECTED: "Промокод не подошёл",
  TOO_MANY_UNPAID: "Много неоплаченных",
  QTY_LIMIT: "Лимит количества",
  ORDER_COOLDOWN: "Слишком часто",
};

/** Delivery problems that mean "this person cannot be reached by the bot". */
export const UNREACHABLE = new Set(["BOT_BLOCKED", "USER_DEACTIVATED", "NOT_STARTED", "CHAT_NOT_FOUND"]);

export function typeLabel(code: string): string {
  return TYPE_LABEL[code] ?? code;
}

export function errorLabel(code: string): string {
  if (code.startsWith("MONO_")) return `Банк: код ${code.slice(5)}`;
  return ERROR_LABEL[code] ?? code;
}

export function sourceLabel(code: string): string {
  return SOURCE_LABEL[code] ?? code;
}

/** Name to show for the customer of a row. */
export function customerLabel(r: ActivityRow): string | null {
  if (!r.tgUserId) return null;
  if (r.customerName) return r.customerName;
  if (r.customerUsername) return "@" + r.customerUsername;
  return "#" + r.tgUserId;
}


/** «→ кому» в строке бота: покупателю — по имени, админам — по подписи. */
export function recipientText(recipient: string, who: string | null): string {
  return recipient === "CUSTOMER" ? who ?? "покупателю" : RECIPIENT_LABEL[recipient] ?? recipient;
}
