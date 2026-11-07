-- Встроенный ИИ, Э4 (07.11.2026): пачки. Пакет — родитель N задач ai_jobs (1 товар = 1 задача), у задачи появляется
-- необязательная ссылка batch_id. Пока пакет в PAUSED, его QUEUED-задачи очередь не берёт (автопродолжения нет).
-- ai_apply_log хранит «до/после» значений карточки при массовом «Принять безопасное»: по нему 24 часа работает
-- «Отменить применение». ai_search_rest — «отдых» поискового провайдера в базе (а не в памяти одного экземпляра:
-- при выкатке живут два бэкенда).
-- Только добавляет: старый бэкенд не читает новые таблицы и колонку, откат — образами (rollback.sh). Убрать при желании:
--   ALTER TABLE ai_jobs DROP INDEX ix_ai_jobs_batch, DROP COLUMN batch_id;
--   DROP TABLE ai_apply_log; DROP TABLE ai_batches; DROP TABLE ai_search_rest;
CREATE TABLE ai_batches (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    feature      VARCHAR(32)  NOT NULL,
    -- RUNNING, PAUSED, DONE, CANCELED (domain.BatchStatus)
    status       VARCHAR(12)  NOT NULL,
    admin_id     BIGINT       NOT NULL,
    total        INT          NOT NULL,
    -- сколько задач пакета могут идти одновременно (2 при >= 20 товарах, иначе 3 = все слоты системы)
    parallel     INT          NOT NULL,
    -- LIMIT_DAY, LIMIT_MONTH, RESTART, FAILURES, SEARCH_DOWN, MANUAL, DISABLED; NULL, пока пакет идёт
    pause_reason VARCHAR(16)  NULL,
    idem_key     VARCHAR(64)  NULL,
    -- пакет, чьи неудачные задачи этот пакет повторяет
    retry_of     BIGINT       NULL,
    created_at   TIMESTAMP(6) NOT NULL,
    updated_at   TIMESTAMP(6) NOT NULL,
    finished_at  TIMESTAMP(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_ai_batches_idem (admin_id, idem_key),
    KEY ix_ai_batches_status (status, created_at),
    KEY ix_ai_batches_admin (admin_id, created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

ALTER TABLE ai_jobs
    ADD COLUMN batch_id BIGINT NULL AFTER retry_of,
    ADD KEY ix_ai_jobs_batch (batch_id, status);

CREATE TABLE ai_apply_log (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    batch_id     BIGINT       NULL,
    job_id       BIGINT       NOT NULL,
    subject_type VARCHAR(24)  NOT NULL,
    subject_id   VARCHAR(64)  NOT NULL,
    admin_id     BIGINT       NOT NULL,
    -- SAFE (массовое «Принять безопасное», его можно отменить) или SINGLE
    kind         VARCHAR(8)   NOT NULL,
    -- значения всей карточки до применения (ключ поля -> значение), нужны, чтобы посчитать, что изменилось
    snapshot     MEDIUMTEXT   NOT NULL,
    -- что изменилось: {"поле": {"before": значение или null, "after": значение}}; NULL, пока применение не завершено
    changes      MEDIUMTEXT   NULL,
    created_at   TIMESTAMP(6) NOT NULL,
    applied_at   TIMESTAMP(6) NULL,
    undone_at    TIMESTAMP(6) NULL,
    -- сколько полей вернули и сколько оставили (их правили вручную после применения)
    undone_reverted INT       NULL,
    undone_skipped  INT       NULL,
    PRIMARY KEY (id),
    KEY ix_ai_apply_batch (batch_id, kind),
    KEY ix_ai_apply_job (job_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE ai_search_rest (
    provider   VARCHAR(24)  NOT NULL,
    rest_until TIMESTAMP(6) NOT NULL,
    reason     VARCHAR(120) NULL,
    PRIMARY KEY (provider)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
