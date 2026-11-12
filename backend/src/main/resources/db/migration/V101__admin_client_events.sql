-- Телеметрия админки (12.11.2026): что происходит у админов на телефонах — ошибки JS, зависания главного потока,
-- тапы в невидимый слой поверх экрана, «злые» тапы без реакции, 401/403 админского API. Пишет только админка
-- (POST /api/admin/telemetry), читает главный админ (GET /api/admin/telemetry) и SQL. Это НЕ client_events:
-- события админов не должны попадать в метрики магазина (analytics_daily*).
-- Хранится 30 дней (AdminTelemetryJobs чистит ночью).
-- Только добавляет: старый бэкенд таблицу не знает и не трогает, откат — образами (infra/rollback.sh).
-- Убрать при желании: DROP TABLE admin_client_events;
CREATE TABLE admin_client_events (
    id          BIGINT        NOT NULL AUTO_INCREMENT,
    admin_id    BIGINT        NOT NULL,               -- telegram_user_id админа из токена, не из тела запроса
    kind        VARCHAR(24)   NOT NULL,               -- error / freeze / blocked_tap / dead_taps / api_401
    path        VARCHAR(200)  NULL,                   -- pathname (+ ?tab=), uuid заменены на <id>
    build       VARCHAR(40)   NULL,                   -- NEXT_PUBLIC_APP_BUILD
    ua          VARCHAR(160)  NULL,                   -- короткий user agent
    standalone  BOOLEAN       NOT NULL DEFAULT FALSE, -- установлено на экран «Домой» (PWA) или вкладка
    meta        JSON          NULL,                   -- подробности (≤ 2 КБ), в том числе trail — последние шаги перед событием
    created_at  TIMESTAMP(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY idx_admin_client_events_created (created_at),
    KEY idx_admin_client_events_admin_created (admin_id, created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
