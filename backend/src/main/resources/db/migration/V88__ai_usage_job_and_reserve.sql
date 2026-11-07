-- Встроенный ИИ, Э1: строка журнала ai_usage знает, какой задаче и какому админу принадлежит, а на каждую идущую задачу
-- в ai_reserve лежит резерв расхода — лимит дня и месяца проверяется как «потрачено + резервы идущих задач».
-- Только добавляет: старый бэкенд пишет в ai_usage без новых (необязательных) колонок. Убрать при желании:
--   ALTER TABLE ai_usage DROP INDEX ix_ai_usage_job, DROP COLUMN job_id, DROP COLUMN admin_id; DROP TABLE ai_reserve;
ALTER TABLE ai_usage
    ADD COLUMN job_id   BIGINT NULL AFTER note,
    ADD COLUMN admin_id BIGINT NULL AFTER job_id,
    ADD KEY ix_ai_usage_job (job_id);

CREATE TABLE ai_reserve (
    job_id         BIGINT       NOT NULL,
    reserve_micro  BIGINT       NOT NULL,
    created_at     TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (job_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
