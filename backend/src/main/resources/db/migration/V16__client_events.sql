-- ============================================================
--  Поведение покупателя в Mini App: клики, переходы, ошибки.
--
--  До этого было видно только результат (заказ/сообщение), а из-за чего человек
--  ушёл — нет. Теперь фронт копит события у себя и присылает их пачкой раз в
--  несколько секунд, поэтому таблица пишется редкими батчами, а не на каждый тап.
--
--  Данные короткоживущие: чистятся через 30 дней (ClientEventService), это журнал
--  для разбора, а не хранилище аналитики.
-- ============================================================

CREATE TABLE client_events (
    id               BIGINT       NOT NULL AUTO_INCREMENT,
    telegram_user_id BIGINT       NOT NULL,
    session_id       VARCHAR(64)  NOT NULL,   -- одна вкладка/запуск Mini App
    event            VARCHAR(64)  NOT NULL,   -- click / view / error / ...
    target           VARCHAR(255) NULL,       -- data-analytics или роль+текст элемента
    path             VARCHAR(255) NULL,       -- маршрут, на котором произошло
    meta             VARCHAR(512) NULL,       -- произвольные детали (JSON-строка)
    client_time      TIMESTAMP    NOT NULL,   -- время по часам устройства
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_client_events_created (created_at),
    KEY idx_client_events_user (telegram_user_id, created_at),
    KEY idx_client_events_session (session_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
