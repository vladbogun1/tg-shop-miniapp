/**
 * Wording of the admin action log (admin_audit_log) — shared by the «Журнал» page and the
 * per-entity history blocks (order / product cards). Unknown codes fall back to the raw code.
 */
import { money, toMinor } from "@/lib/money";

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
  CUSTOMER_FLAG: "Покупатель помечен проблемным",
  CUSTOMER_FLAG_EDIT: "Причина «проблемного» изменена",
  CUSTOMER_UNFLAG: "Метка «проблемный» снята",
  ORDER_STATUS: "Статус заказа",
  ORDER_PAID: "Оплата заказа",
  ORDER_REFUND_ONLINE: "Возврат на карту",
  ORDER_DISCOUNT: "Скидка в заказе",
  ORDER_GIFT: "Подарок в заказ",
  ORDER_ITEM_ADD: "Позиция добавлена",
  ORDER_ITEM_QTY: "Количество позиции",
  ORDER_TOPUP: "Как берём доплату",
  ORDER_ITEM_REMOVE: "Позиция удалена",
  ORDER_EXCHANGE: "Обмен товара",
  ORDER_MERGE: "Объединение заказов",
  ORDER_MERGED_INTO: "Заказ объединён в другой",
  ORDER_DELETE: "Заказ удалён",
  ORDER_TRACKING: "ТТН заказа",
  NP_TTN_CREATE: "ТТН создана",
  NP_TTN_UPDATE: "ТТН изменена",
  NP_TTN_CANCEL: "ТТН удалена",
  NP_TTN_BATCH: "ТТН для всех",
  NP_SENDER: "Отправитель НП",
  NP_SENDER_LOAD: "Отправитель НП из кабинета",
  NP_WEBHOOK_SUBSCRIBE: "Вебхук НП: подписка",
  NP_WEBHOOK_UNSUBSCRIBE: "Вебхук НП: отписка",
  PRODUCT_PARCEL_SIZE: "Вес и коробка товара",
  CATEGORY_PARCEL_SIZE: "Вес и коробка категории",
  ORDER_SHIP_UNPAID: "Отправлен без предоплаты",
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
  BROADCAST_STOP: "Рассылка остановлена",
  TRANSLATIONS_IMPORT: "Импорт переводов",
  TRANSLATIONS_DELETE: "Сброс переводов",
  TRANSLATIONS_SOURCE_FIX: "Правка текста + переводы",
  TRANSLATIONS_ACCEPT: "Переводы приняты",
  SETTINGS_UPDATE: "Настройки изменены",
  AI_JOB_START: "ИИ: задача запущена",
  AI_JOB_CANCEL: "ИИ: задача остановлена",
  AI_JOB_OUTCOME: "ИИ: итог применения",
  AI_STOP_ALL: "ИИ: остановлены все задачи",
  AI_BATCH_START: "ИИ: пакет запущен",
  AI_BATCH_PAUSE: "ИИ: пакет на паузе",
  AI_BATCH_RESUME: "ИИ: пакет продолжен",
  AI_BATCH_CANCEL: "ИИ: пакет остановлен",
  AI_MANUAL_BATCH: "Вручную через ChatGPT: пакет начат",
  AI_MANUAL_BATCH_DISCARD: "Вручную через ChatGPT: пакет удалён",
  AI_APPLY_SAFE: "ИИ: принято безопасное",
  AI_APPLY: "ИИ: результат применён",
  AI_APPLY_NOT_SAFE: "ИИ: безопасное применение возвращено",
  AI_APPLY_UNDO: "ИИ: применение отменено",
  SITE_REVALIDATE: "Обновление сайта",
  INBOX_DISMISS: "«Внимание»: разобрано",
  INBOX_RESTORE: "«Внимание»: возвращено",
  INCIDENT_REOPEN: "Инцидент открыт заново",
  INCIDENT_RESOLVE: "Инцидент закрыт",
  ORDER_CREATE_ADMIN: "Заказ создан админом",
  ORDER_ARCHIVE: "Заказ в архив",
  ORDER_UNARCHIVE: "Заказ из архива",
  ORDER_GIFT_CASE: "Кейс подарка выдан",
  ORDER_RETURN_RECEIVED: "Возврат получен на склад",
  ORDER_RETURN_CANCEL: "Возврат отменён",
  ORDER_RETURN_DEBT_PAID: "Долг по возврату оплачен",
  STOCK_WRITEOFF_RESTORE: "Списание отменено",
  GIFT_CASE_ITEM_CREATE: "Приз кейса создан",
  GIFT_CASE_ITEM_UPDATE: "Приз кейса изменён",
  GIFT_CASE_ITEM_DELETE: "Приз кейса удалён",
  GIFT_CASE_ITEMS_REPLACE: "Призы кейса заменены",
  GIFT_CASE_TIER_UPDATE: "Уровень кейса изменён",
  COSTING_BATCH_MONEY: "Деньги поставки",
  COSTING_EXPENSE_ADD: "Расход добавлен",
  COSTING_EXPENSE_EDIT: "Расход изменён",
  COSTING_EXPENSE_DELETE: "Расход удалён",
  COSTING_EXPENSE_FILE_ADD: "Файл расхода добавлен",
  COSTING_EXPENSE_FILE_DELETE: "Файл расхода удалён",
  COSTING_OPENING: "Начальная себестоимость",
  COSTING_LOT_COST: "Закупка партии вручную",
  COSTING_LOT_SOURCE: "Откуда штуки на складе",
  COSTING_RECONCILE: "Сверка себестоимости",
  PREORDER_SUPPLIER_CREATE: "Поставщик создан",
  PREORDER_BATCH_CREATE: "Поставка создана",
  PREORDER_BATCH_UPDATE: "Поставка изменена",
  PREORDER_BATCH_STATUS: "Статус поставки",
  PREORDER_BATCH_ARRIVE: "Поставка прибыла",
  PREORDER_BATCH_CANCEL: "Поставка отменена",
  PREORDER_RELEASE: "Предзаказ выпущен",
  PREORDER_SUBSCRIBERS_EXPORT: "Выгрузка подписчиков",
  PREORDER_SUBSCRIPTION_REMOVE: "Подписка убрана",
  SUPPLY_DRAFT_CREATE: "Черновик поставки с ИИ",
  SUPPLY_DRAFT_DELETE: "Черновик поставки удалён",
  SUPPLY_DRAFT_REREAD: "Черновик поставки: перечитать накладную",
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
  AI: "ИИ",
  AI_JOB: "Задача ИИ",
  AI_BATCH: "Пакет ИИ",
  SITE: "Сайт",
  REVIEW: "Отзыв",
  REPLY_TEMPLATE: "Шаблон ответа",
  SUPPLY_DRAFT: "Черновик поставки",
  USER: "Покупатель",
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
  "ORDER_SHIP_UNPAID",
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
    .replace(/(\d+(?:\.\d+)?) UAH/g, (_, n: string) => money(toMinor(n)))
    .replace(/(статус → )([A-Z]+)/g, (m, pre: string, code: string) =>
      AUDIT_STATUS_LABEL[code] ? pre + AUDIT_STATUS_LABEL[code] : m,
    );
}
