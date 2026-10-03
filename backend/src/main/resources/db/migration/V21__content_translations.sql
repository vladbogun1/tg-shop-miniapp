-- ============================================================
--  Переводы контента (товары, варианты, категории, способы оплаты) — docs/CONTENT-I18N.md.
--  Русский в основных таблицах остаётся источником истины; эта таблица — слой поверх,
--  её можно очистить целиком без потери данных. FK нет (одна таблица на все сущности):
--  осиротевшие строки чистит TranslationAdminService (по расписанию и при удалении).
-- ============================================================

CREATE TABLE content_translations (
    entity_type ENUM('PRODUCT','VARIANT','TAG','PAYMENT_OPTION') NOT NULL,
    entity_id   BINARY(16)  NOT NULL,
    field       VARCHAR(32) NOT NULL,
    locale      VARCHAR(8)  NOT NULL,
    text        TEXT        NOT NULL,
    source_hash CHAR(64)    NOT NULL,
    origin      ENUM('AI','MANUAL') NOT NULL DEFAULT 'AI',
    updated_by  BIGINT      NULL,
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (entity_type, entity_id, field, locale),
    KEY idx_ct_locale_type (locale, entity_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
