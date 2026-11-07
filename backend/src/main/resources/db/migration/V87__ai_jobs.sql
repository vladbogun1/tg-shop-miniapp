-- Встроенный ИИ, этап Э1 (07.11.2026): задачи ИИ живут в базе, а не в памяти процесса. Запущенная из админки задача
-- переживает выкатку (два экземпляра бэкенда живут одновременно), закрытую вкладку и перезапуск; её берёт любой
-- экземпляр через SELECT ... FOR UPDATE SKIP LOCKED, живость видна по heartbeat_at.
-- Только добавляет таблицы: старый бэкенд их не читает, откат — образами (rollback.sh). Убрать при желании:
--   DROP TABLE ai_job_bodies; DROP TABLE ai_jobs;
CREATE TABLE ai_jobs (
    id               BIGINT       NOT NULL AUTO_INCREMENT,
    feature          VARCHAR(32)  NOT NULL,
    -- QUEUED, RUNNING, DONE, EMPTY, BAD_ANSWER, FAILED, CANCELED (domain.JobStatus)
    status           VARCHAR(16)  NOT NULL,
    -- кто запустил: id админа (в фоновом потоке текущего пользователя нет)
    admin_id         BIGINT       NOT NULL,
    -- ради какого объекта: product / supply / translation-batch; подпись версии объекта на старте
    subject_type     VARCHAR(24)  NOT NULL,
    subject_id       VARCHAR(64)  NOT NULL,
    subject_version  VARCHAR(64)  NULL,
    mode             VARCHAR(12)  NOT NULL DEFAULT 'NORMAL',
    effort           VARCHAR(8)   NOT NULL,
    research_items   INT          NOT NULL DEFAULT 0,
    prompt_version   VARCHAR(32)  NULL,
    -- защита от двойного клика: тот же ключ того же админа отдаёт ту же задачу
    idem_key         VARCHAR(64)  NULL,
    retry_of         BIGINT       NULL,
    cancel_requested TINYINT(1)   NOT NULL DEFAULT 0,
    -- сколько раз задачу брали в работу (прерванную выкаткой берут один раз заново)
    attempts         INT          NOT NULL DEFAULT 0,
    -- BUILTIN (встроенный ИИ) или MANUAL (ручной путь через ChatGPT)
    path             VARCHAR(12)  NOT NULL DEFAULT 'BUILTIN',
    -- итоги, записываются при завершении
    cost_micro_usd   BIGINT       NOT NULL DEFAULT 0,
    rate_milli       INT          NOT NULL DEFAULT 0,
    input_tokens     INT          NOT NULL DEFAULT 0,
    cached_tokens    INT          NOT NULL DEFAULT 0,
    output_tokens    INT          NOT NULL DEFAULT 0,
    model_calls      INT          NOT NULL DEFAULT 0,
    searches         INT          NOT NULL DEFAULT 0,
    pages            INT          NOT NULL DEFAULT 0,
    repaired         TINYINT(1)   NOT NULL DEFAULT 0,
    error_code       VARCHAR(40)  NULL,
    error_note       VARCHAR(255) NULL,
    -- что админ сделал с результатом (POST /jobs/{id}/outcome): APPLIED, PARTIAL, REJECTED
    outcome          VARCHAR(16)  NULL,
    outcome_applied  INT          NULL,
    outcome_rejected INT          NULL,
    outcome_edited   INT          NULL,
    outcome_ignored  INT          NULL,
    outcome_at       TIMESTAMP(6) NULL,
    created_at       TIMESTAMP(6) NOT NULL,
    started_at       TIMESTAMP(6) NULL,
    finished_at      TIMESTAMP(6) NULL,
    heartbeat_at     TIMESTAMP(6) NULL,
    deadline_at      TIMESTAMP(6) NULL,
    locked_by        VARCHAR(64)  NULL,
    -- одна активная задача на объект: для QUEUED и RUNNING ключ заполнен, для остальных NULL
    active_key       VARCHAR(100) GENERATED ALWAYS AS (
                         IF(status IN ('QUEUED', 'RUNNING'), CONCAT(subject_type, ':', subject_id), NULL)) STORED,
    PRIMARY KEY (id),
    UNIQUE KEY uq_ai_jobs_active (active_key),
    UNIQUE KEY uq_ai_jobs_idem (admin_id, idem_key),
    KEY ix_ai_jobs_status (status, created_at),
    KEY ix_ai_jobs_subject (subject_type, subject_id, created_at),
    KEY ix_ai_jobs_feature (feature, created_at),
    KEY ix_ai_jobs_admin (admin_id, created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Промпт и ответ отдельно от строки задачи: тяжёлые, чистятся через 60 дней, а задача (цена, исход) остаётся.
CREATE TABLE ai_job_bodies (
    job_id     BIGINT       NOT NULL,
    prompt     MEDIUMTEXT   NOT NULL,
    answer     MEDIUMTEXT   NULL,
    created_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (job_id),
    KEY ix_ai_job_bodies_created (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
