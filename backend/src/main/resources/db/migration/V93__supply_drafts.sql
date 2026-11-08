-- Черновик «Поставки с ИИ» (08.11.2026): админ прикладывает накладную и жмёт одну кнопку, дальше сервер сам ведёт шаги —
-- чтение накладной, сопоставление строк с каталогом, карточки новых товаров — и по готовности зовёт проверить итог.
-- Пока черновик не принят, в каталоге и в поставках ничего не создано: всё лежит здесь, в state (JSON-текст:
-- документ, строки с решениями, планы новых товаров, ответы карточек, шапка поставки, номера задач ИИ).
-- status: RUNNING (идут шаги) / READY (ждёт проверки) / FAILED (шаг не удался, можно повторить) / ACCEPTED (создана
-- поставка batch_id). step: READ / MATCH / CARDS / DONE — текущий шаг конвейера. file_ids — картинки накладной (ai_files).
-- version — защита от одновременных правок двух вкладок и тика конвейера.
-- Только добавляет: старый бэкенд новую таблицу не читает, откат — образами (infra/rollback.sh). Убрать при желании:
--   DROP TABLE supply_drafts;
CREATE TABLE supply_drafts (
    id         BIGINT       NOT NULL AUTO_INCREMENT,
    admin_id   BIGINT       NOT NULL,
    status     VARCHAR(16)  NOT NULL,
    step       VARCHAR(16)  NOT NULL,
    title      VARCHAR(255) NULL,
    failure    VARCHAR(500) NULL,
    file_ids   VARCHAR(500) NOT NULL,
    state      MEDIUMTEXT   NOT NULL,
    batch_id   BIGINT       NULL,
    version    BIGINT       NOT NULL DEFAULT 0,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    ready_at   TIMESTAMP(6) NULL,
    PRIMARY KEY (id),
    KEY ix_supply_drafts_status (status, id),
    KEY ix_supply_drafts_admin (admin_id, status)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
