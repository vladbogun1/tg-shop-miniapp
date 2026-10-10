/**
 * Wording of the admin action log (admin_audit_log) — shared by the «Журнал» page and the
 * per-entity history blocks (order / product cards). Unknown codes fall back to the raw code.
 */
import { money } from "@/lib/money";

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  ADMIN_LOGIN_OK: "Вход в админку",
  ADMIN_LOGIN_FAIL: "Неудачный вход",
  ADMIN_LOCKED: "Вход заблокирован",
  ADMIN_2FA_SETUP: "2FA включена",
  ADMIN_2FA_RESET: "2FA перенастроена",
  ADMIN_PASSWORD_CHANGE: "Смена пароля",
  ADMIN_DEVICES_FORGET: "Устройства забыты",
  ADMIN_LOGOUT_ALL: "Выход везде",
  ADMIN_BLOCK_TG: "Блокировка из Telegram",
  ADMIN_EMERGENCY_RESET: "Аварийный сброс",
  ADMIN_ACCOUNT_FAIL: "Неверный пароль/код",
  ADMIN_INVITE: "Админ приглашён",
  ADMIN_INVITE_RESENT: "Приглашение отправлено заново",
  ADMIN_INVITE_REVOKED: "Приглашение отозвано",
  ADMIN_INVITE_ACCEPTED: "Приглашение принято",
  ADMIN_INVITE_FAIL: "Неверный код приглашения",
  ADMIN_UPDATE: "Админ изменён",
  ADMIN_BLOCKED: "Админ заблокирован",
  ADMIN_UNBLOCKED: "Админ разблокирован",
  ADMIN_DELETED: "Админ удалён",
  ADMIN_2FA_RESET_BY: "Сброс 2FA админу",
  ADMIN_PASSWORD_RESET_BY: "Сброс пароля админу",
  ADMIN_DEVICES_FORGET_BY: "Устройства админа забыты",
  ORDER_STATUS: "Статус заказа",
  ORDER_PAID: "Оплата заказа",
  ORDER_REFUND_ONLINE: "Возврат на карту",
  ORDER_DISCOUNT: "Скидка в заказе",
  ORDER_GIFT: "Подарок в заказ",
  ORDER_ITEM_ADD: "Позиция добавлена",
  ORDER_ITEM_QTY: "Количество позиции",
  ORDER_ITEM_REMOVE: "Позиция удалена",
  ORDER_EXCHANGE: "Обмен товара",
  ORDER_DELETE: "Заказ удалён",
  ORDER_TRACKING: "ТТН заказа",
  ORDER_DELIVERY: "Доставка заказа",
  ORDER_RETURN: "Возврат товара",
  ORDER_CANCEL_REQUEST_APPROVE: "Запрос отмены принят",
  ORDER_CANCEL_REQUEST_DECLINE: "Запрос отмены отклонён",
  DISPATCH_BROADCAST: "Карточки «К отправке» заново",
  PRODUCT_CREATE: "Товар создан",
  PRODUCT_UPDATE: "Товар изменён",
  PRODUCT_ACTIVE: "Видимость товара",
  PRODUCT_ARCHIVE: "Архив товара",
  TAG_CREATE: "Тег создан",
  TAG_UPDATE: "Тег изменён",
  TAG_DELETE: "Тег удалён",
  CATEGORY_CREATE: "Категория создана",
  CATEGORY_UPDATE: "Категория изменена",
  CATEGORY_DELETE: "Категория удалена",
  CATEGORY_REORDER: "Порядок категорий",
  BRAND_CREATE: "Бренд создан",
  BRAND_UPDATE: "Бренд изменён",
  BRAND_DELETE: "Бренд удалён",
  BRAND_MERGE: "Бренды объединены",
  SPEC_ATTRIBUTE_CREATE: "Характеристика создана",
  SPEC_ATTRIBUTE_UPDATE: "Характеристика изменена",
  SPEC_ATTRIBUTE_DELETE: "Характеристика удалена",
  SPEC_OPTION_RENAME: "Опции объединены",
  SPEC_GROUPS_UPDATE: "Группы характеристик",
  CATALOG_SCHEMA_IMPORT: "Импорт схемы каталога",
  CARDS_IMPORT: "Импорт карточек (ИИ)",
  PRODUCT_CARD_STATUS: "Статус карточки",
  CARD_ACCEPT: "Карточка принята",
  REVIEW_PUBLISH: "Отзыв опубликован",
  REVIEW_HIDE: "Отзыв скрыт",
  REVIEW_DELETE: "Отзыв удалён",
  REVIEW_REPLY: "Ответ на отзыв",
  REVIEW_REPLY_REMOVE: "Ответ на отзыв убран",
  REPLY_TEMPLATE_CREATE: "Шаблон ответа создан",
  REPLY_TEMPLATE_UPDATE: "Шаблон ответа изменён",
  REPLY_TEMPLATE_DELETE: "Шаблон ответа удалён",
  PROMO_CREATE: "Промокод создан",
  PROMO_UPDATE: "Промокод изменён",
  PROMO_DELETE: "Промокод удалён",
  PAYMENT_OPTIONS: "Способы оплаты",
  /** Kept for old log entries: the requisites screen is gone (payment is online only). */
  PAYMENT_REQUISITES: "Реквизиты оплаты",
  BROADCAST_START: "Рассылка",
  BROADCAST_TEST: "Тест рассылки",
  TRANSLATIONS_IMPORT: "Импорт переводов",
  TRANSLATIONS_DELETE: "Сброс переводов",
  TRANSLATIONS_SOURCE_FIX: "Правка текста + переводы",
  TRANSLATIONS_ACCEPT: "Переводы приняты",
  SETTINGS_UPDATE: "Настройки изменены",
  SITE_REVALIDATE: "Обновление сайта",
  INBOX_DISMISS: "«Внимание»: разобрано",
  INBOX_RESTORE: "«Внимание»: возвращено",
};

export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  ORDER: "Заказ",
  PRODUCT: "Товар",
  TAG: "Тег",
  CATEGORY: "Категория",
  BRAND: "Бренд",
  SPEC_ATTRIBUTE: "Характеристика",
  CATALOG: "Каталог",
  PROMO: "Промокод",
  PAYMENT: "Оплата",
  BROADCAST: "Рассылка",
  AUTH: "Вход",
  ADMIN: "Админ",
  TRANSLATION: "Переводы",
  SETTINGS: "Настройки",
  SITE: "Сайт",
  REVIEW: "Отзыв",
  REPLY_TEMPLATE: "Шаблон ответа",
};

/** Actions worth a red/amber marker in the log (money, deletions, failed logins). */
export const AUDIT_RISKY = new Set([
  "ADMIN_LOGIN_FAIL",
  "ADMIN_LOCKED",
  "ADMIN_BLOCK_TG",
  "ADMIN_EMERGENCY_RESET",
  "ADMIN_ACCOUNT_FAIL",
  "ADMIN_INVITE_FAIL",
  "ADMIN_BLOCKED",
  "ADMIN_DELETED",
  "ADMIN_2FA_RESET_BY",
  "ADMIN_PASSWORD_RESET_BY",
  "REVIEW_DELETE",
  "ORDER_DELETE",
  "ORDER_REFUND_ONLINE",
  "PAYMENT_REQUISITES",
  "PROMO_DELETE",
  "TAG_DELETE",
  "CATEGORY_DELETE",
  "BRAND_DELETE",
  "BRAND_MERGE",
  "SPEC_ATTRIBUTE_DELETE",
]);

export function auditActionLabel(code: string): string {
  return AUDIT_ACTION_LABEL[code] ?? code;
}

export function auditEntityLabel(code: string): string {
  return AUDIT_ENTITY_LABEL[code] ?? code;
}

/** In-app link to the entity of a log row, when there is a page for it. */
export function auditEntityHref(entityType: string, entityId?: string | null): string | null {
  if (!entityId) return null;
  if (entityType === "ORDER") return `/orders/${entityId}`;
  if (entityType === "PRODUCT") return `/products?edit=${entityId}`;
  if (entityType === "CATEGORY") return `/categories?edit=${entityId}`;
  if (entityType === "BRAND") return "/brands";
  return null;
}

const AUDIT_STATUS_LABEL: Record<string, string> = {
  NEW: "Новый",
  APPROVED: "Одобрен",
  SHIPPED: "Отправлен",
  DELIVERED: "Доставлен",
  REJECTED: "Отклонён",
};

const uah = (minor: string) => money(Number(minor));

/**
 * The text of a log entry as an admin should read it. Older entries were written by the backend
 * with raw kopecks ("скидка: 10000 (мин. ед.)", "цена 150000 → 130000", "1500.0 UAH") and status
 * codes ("статус → APPROVED"); those rows stay in the database as they are, so they are made
 * readable here. New entries already come formatted (MoneyFormat on the backend) and pass through.
 */
export function readableAuditDetails(details: string | null | undefined): string {
  if (!details) return "";
  return details
    .replace(/(-?\d+) \(мин\. ед\.\)/g, (_, n: string) => uah(n))
    .replace(/цена (\d+) → (\d+)/g, (_, a: string, b: string) => `цена ${uah(a)} → ${uah(b)}`)
    .replace(/, price (\d+), stock (\d+)/g, (_, p: string, s: string) => `, цена ${uah(p)}, сток ${s}`)
    .replace(/(\d+(?:\.\d+)?) UAH/g, (_, n: string) => money(Math.round(Number(n) * 100)))
    .replace(/(статус → )([A-Z]+)/g, (m, pre: string, code: string) =>
      AUDIT_STATUS_LABEL[code] ? pre + AUDIT_STATUS_LABEL[code] : m,
    );
}
