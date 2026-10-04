-- ============================================================
--  «Внимание» (инбокс админки): отложенные и разобранные строки.
--
--  Сами строки инбокса не хранятся — они каждый раз вычисляются из заказов, чатов,
--  склада и статуса ревалидации сайта. Здесь только отметки владельца:
--    SNOOZED   — «Отложить» до until_at;
--    DISMISSED — «Разобрано» (только информационные строки: отказы/возвраты, склад, сайт).
--
--  Ключ = тип строки + id сущности (заказ / товар[:вариант] / site). item_version —
--  версия события на момент отметки (время заявки «я оплатил», id последнего
--  непрочитанного сообщения, время отказа/возврата…): если событие обновилось,
--  версия не совпадёт и строка снова всплывёт, несмотря на отметку.
-- ============================================================

CREATE TABLE inbox_marks (
    item_type       VARCHAR(32)  NOT NULL,
    entity_id       VARCHAR(80)  NOT NULL,
    item_version    VARCHAR(64)  NOT NULL,
    -- SNOOZED / DISMISSED
    mark            VARCHAR(16)  NOT NULL,
    -- Конец «Отложить»; NULL для DISMISSED.
    until_at        TIMESTAMP    NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- telegram_user_id админа и имя на момент отметки.
    created_by      BIGINT       NULL,
    created_by_name VARCHAR(255) NULL,
    PRIMARY KEY (item_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
