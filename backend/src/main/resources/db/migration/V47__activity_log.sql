-- ============================================================
--  Журнал «Бот и сайт» (вкладка в «Журнале» админки).
--  Что делали бот, сайт, Mini App, оплата и фоновые задачи — в отличие
--  от admin_audit_log, где только действия админов.
--  Главное — сообщения бота: кому что ушло, кому не доставлено и почему
--  (бот заблокирован, чат не найден, 429 ...). Каждая рассылка — по строке
--  на получателя с group_id = 'broadcast:<broadcasts.id>'.
--  Пишется асинхронно и best-effort; строки старше app.journal.retention-days
--  (по умолчанию 90) удаляются ночью.
-- ============================================================

CREATE TABLE activity_log (
    id          BIGINT        NOT NULL AUTO_INCREMENT,
    created_at  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    -- BOT | SITE | MINIAPP | PAYMENT | SYSTEM
    source      VARCHAR(16)   NOT NULL,
    -- ORDER_STATUS / BROADCAST / RECEIPT / ORDER_CREATED / PAYMENT_SUCCESS / ...
    type        VARCHAR(48)   NOT NULL,
    -- OK | FAILED | SKIPPED
    result      VARCHAR(12)   NOT NULL,
    -- кому писал бот: CUSTOMER (личка покупателя) | ADMINS (чат/личка админов); NULL — не сообщение
    recipient   VARCHAR(12)   NULL,
    -- покупатель (users.telegram_user_id — он же id пользователя магазина)
    tg_user_id  BIGINT        NULL,
    -- чат, куда ушло сообщение бота (личка = tg_user_id, либо группа админов)
    chat_id     BIGINT        NULL,
    order_id    BINARY(16)    NULL,
    -- группировка: 'broadcast:<id>' для рассылок
    group_id    VARCHAR(64)   NULL,
    -- превью сообщения / краткое описание (без HTML, до 500 символов)
    summary     VARCHAR(500)  NULL,
    -- BOT_BLOCKED | CHAT_NOT_FOUND | USER_DEACTIVATED | NOT_STARTED | RATE_LIMITED | BAD_REQUEST | NETWORK | ...
    error_code  VARCHAR(32)   NULL,
    error       VARCHAR(500)  NULL,
    -- JSON-объект с подробностями (суммы, коды, статус и т.п.)
    details     VARCHAR(2000) NULL,
    PRIMARY KEY (id),
    KEY idx_activity_created (created_at),
    KEY idx_activity_source (source, created_at),
    KEY idx_activity_type (type, created_at),
    KEY idx_activity_result (result, created_at),
    KEY idx_activity_user (tg_user_id, created_at),
    KEY idx_activity_order (order_id),
    KEY idx_activity_group (group_id, result)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
