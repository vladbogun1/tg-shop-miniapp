-- Встроенный ИИ, Э6 (07.11.2026): файлы для «Прочитать с ИИ» в поставке (скрины заказов, накладные, страницы PDF).
-- Файл хранится в отдельном бакете MinIO (ai-files), в базе — только запись о нём. job_id пуст, пока файл загружен,
-- а задача ещё не создана; при старте задачи файлы привязываются к ней. expires_at = загрузка + 7 дней: по нему
-- AiFileJobs каждую ночь удаляет и запись, и объект (то же правило TTL стоит и на самом бакете).
-- upload_id — одна загрузка (у PDF несколько страниц = несколько строк с одним upload_id, page = номер страницы).
-- Только добавляет: старый бэкенд новую таблицу не читает, откат — образами (rollback.sh). Убрать при желании:
--   DROP TABLE ai_files;
-- (объекты в бакете ai-files удалит правило TTL за 7 дней или `mc rm --recursive --force <alias>/ai-files`)
CREATE TABLE ai_files (
    id         BIGINT       NOT NULL AUTO_INCREMENT,
    job_id     BIGINT       NULL,
    admin_id   BIGINT       NOT NULL,
    upload_id  VARCHAR(36)  NOT NULL,
    name       VARCHAR(160) NOT NULL,
    object_key VARCHAR(120) NOT NULL,
    mime       VARCHAR(32)  NOT NULL,
    size       INT          NOT NULL,
    page       INT          NULL,
    created_at TIMESTAMP(6) NOT NULL,
    expires_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_ai_files_key (object_key),
    KEY ix_ai_files_job (job_id),
    KEY ix_ai_files_admin (admin_id, job_id),
    KEY ix_ai_files_expires (expires_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
