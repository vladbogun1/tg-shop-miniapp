-- ============================================================
--  Пакет D (админка v2):
--  1) Перевод реквизитов оплаты (Р9): примечание и назначение платежа видит покупатель,
--     у украино- и англоязычных был русский текст. entity_id = фиксированный
--     00000000-0000-0000-0000-000000000001 (в payment_requisites одна строка с id = 1).
--  2) История рассылок (R9): что, кому, когда и с каким результатом отправили. Раньше
--     был виден только статус последней рассылки в памяти бэкенда.
-- ============================================================

ALTER TABLE content_translations
    MODIFY entity_type ENUM('PRODUCT','VARIANT','TAG','PAYMENT_OPTION','PAYMENT_REQUISITES') NOT NULL;

CREATE TABLE broadcasts (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    admin_id     BIGINT       NULL,                 -- telegram_user_id администратора
    admin_name   VARCHAR(255) NULL,                 -- снимок имени
    text         TEXT         NOT NULL,             -- основной текст (запасной для всех языков)
    text_uk      TEXT         NULL,                 -- украинская версия (если задана)
    text_ru      TEXT         NULL,                 -- русская версия (если задана)
    text_en      TEXT         NULL,                 -- английская версия (если задана)
    audience     VARCHAR(16)  NOT NULL,             -- all / active / inactive / premium
    lang         VARCHAR(8)   NULL,                 -- фильтр по языку покупателя: uk/ru/en, NULL = все
    with_button  BOOLEAN      NOT NULL DEFAULT FALSE,
    status       VARCHAR(16)  NOT NULL,             -- RUNNING / DONE / INTERRUPTED
    total        INT          NOT NULL DEFAULT 0,
    sent         INT          NOT NULL DEFAULT 0,
    failed       INT          NOT NULL DEFAULT 0,
    blocked      INT          NOT NULL DEFAULT 0,
    started_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at  TIMESTAMP    NULL,
    PRIMARY KEY (id),
    KEY idx_broadcasts_started (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
