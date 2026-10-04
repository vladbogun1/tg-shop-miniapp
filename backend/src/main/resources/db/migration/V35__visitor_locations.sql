-- ============================================================
--  Карта пользователей в админке: последний IP и примерная геолокация посетителя.
--
--  Одна строка = один посетитель, только ПОСЛЕДНЕЕ значение (не история):
--    visitor_key = 'tg:<telegram_user_id>' — вошедший покупатель (Mini App или сайт);
--    visitor_key = 'anon:<anonId>'         — анонимный посетитель сайта (id из localStorage).
--  Пишется не на каждый запрос: в памяти бэкенда троттлинг (раз в ~15 мин на посетителя),
--  запись асинхронная и никогда не ломает магазин (VisitorLocationService).
--  Координаты — из офлайн-базы DB-IP «IP to City Lite» (уровень города); если базы нет,
--  lat/lon пустые и точка на карте не рисуется.
--  Строки старше 90 дней удаляются ночной задачей (политика приватности сайта).
-- ============================================================

CREATE TABLE visitor_locations (
    visitor_key      VARCHAR(80)   NOT NULL,
    telegram_user_id BIGINT        NULL,
    anon_id          VARCHAR(64)   NULL,
    -- Откуда пришёл последний запрос: MINIAPP | WEB.
    channel          VARCHAR(16)   NOT NULL,
    ip               VARCHAR(45)   NOT NULL,
    country_code     CHAR(2)       NULL,
    country          VARCHAR(100)  NULL,
    city             VARCHAR(120)  NULL,
    lat              DECIMAL(8, 4) NULL,
    lon              DECIMAL(8, 4) NULL,
    seen_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (visitor_key),
    KEY idx_visitor_locations_seen (seen_at),
    KEY idx_visitor_locations_coords (lat, lon),
    KEY idx_visitor_locations_user (telegram_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
