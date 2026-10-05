/**
 * Wording of the admin action log (admin_audit_log) — shared by the «Журнал» page and the
 * per-entity history blocks (order / product cards). Unknown codes fall back to the raw code.
 */

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
  ORDER_STATUS: "Статус заказа",
  ORDER_PAID: "Оплата заказа",
  ORDER_DISCOUNT: "Скидка в заказе",
  ORDER_GIFT: "Подарок в заказ",
  ORDER_ITEM_ADD: "Позиция добавлена",
  ORDER_ITEM_QTY: "Количество позиции",
  ORDER_ITEM_REMOVE: "Позиция удалена",
  ORDER_DELETE: "Заказ удалён",
  PRODUCT_CREATE: "Товар создан",
  PRODUCT_UPDATE: "Товар изменён",
  PRODUCT_ACTIVE: "Видимость товара",
  PRODUCT_ARCHIVE: "Архив товара",
  TAG_CREATE: "Тег создан",
  TAG_UPDATE: "Тег изменён",
  TAG_DELETE: "Тег удалён",
  PROMO_CREATE: "Промокод создан",
  PROMO_UPDATE: "Промокод изменён",
  PROMO_DELETE: "Промокод удалён",
  PAYMENT_OPTIONS: "Способы оплаты",
  PAYMENT_REQUISITES: "Реквизиты оплаты",
  BROADCAST_START: "Рассылка",
  BROADCAST_TEST: "Тест рассылки",
  TRANSLATIONS_IMPORT: "Импорт переводов",
  TRANSLATIONS_DELETE: "Сброс переводов",
  TRANSLATIONS_SOURCE_FIX: "Правка текста + переводы",
  SETTINGS_UPDATE: "Настройки изменены",
  SITE_REVALIDATE: "Обновление сайта",
  INBOX_DISMISS: "«Внимание»: разобрано",
  INBOX_RESTORE: "«Внимание»: возвращено",
};

export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  ORDER: "Заказ",
  PRODUCT: "Товар",
  TAG: "Тег",
  PROMO: "Промокод",
  PAYMENT: "Оплата",
  BROADCAST: "Рассылка",
  AUTH: "Вход",
  ADMIN: "Админ",
  TRANSLATION: "Переводы",
  SETTINGS: "Настройки",
  SITE: "Сайт",
};

/** Actions worth a red/amber marker in the log (money, deletions, failed logins). */
export const AUDIT_RISKY = new Set([
  "ADMIN_LOGIN_FAIL",
  "ADMIN_LOCKED",
  "ADMIN_BLOCK_TG",
  "ADMIN_EMERGENCY_RESET",
  "ADMIN_ACCOUNT_FAIL",
  "ORDER_DELETE",
  "PAYMENT_REQUISITES",
  "PROMO_DELETE",
  "TAG_DELETE",
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
  return null;
}
