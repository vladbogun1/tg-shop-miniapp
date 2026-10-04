-- ============================================================
--  Дневные агрегаты поведения покупателей (воронка, интерес к товарам).
--
--  client_events — журнал, он чистится через 30 дней. Чтобы воронка и
--  «сколько смотрели товар» жили дольше, ночная задача сворачивает каждый
--  закрытый день (по Киеву) в компактные таблицы:
--
--  analytics_daily_visitors — одна строка на посетителя за день и канал:
--    битовая маска пройденных шагов (1 зашёл, 2 открыл товар, 4 в корзину,
--    8 оформление). Уникальные посетители за ЛЮБОЙ период считаются точно:
--    COUNT(DISTINCT visitor_key). Это сотни строк в день, хранится всегда.
--
--  analytics_daily — интерес к товару за день: просмотры, уникальные
--    смотревшие (за день), добавления в корзину.
--
--  analytics_daily_runs — какие дни уже свёрнуты (в том числе пустые),
--    чтобы дочитывать незакрытые дни прямо из client_events.
-- ============================================================

CREATE TABLE analytics_daily_visitors (
    day              DATE                  NOT NULL,
    channel          ENUM('MINIAPP','WEB') NOT NULL,
    visitor_key      VARCHAR(80)           NOT NULL,  -- t:<telegram id> или a:<анонимный id сайта>
    telegram_user_id BIGINT                NULL,
    stages           TINYINT UNSIGNED      NOT NULL,
    events           INT                   NOT NULL,
    PRIMARY KEY (day, channel, visitor_key),
    KEY idx_adv_user (telegram_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE analytics_daily (
    day        DATE                  NOT NULL,
    channel    ENUM('MINIAPP','WEB') NOT NULL,
    product_id BINARY(16)            NOT NULL,
    views      INT                   NOT NULL,
    viewers    INT                   NOT NULL,
    cart_adds  INT                   NOT NULL,
    PRIMARY KEY (day, channel, product_id),
    KEY idx_ad_product (product_id, day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE analytics_daily_runs (
    day           DATE      NOT NULL,
    events        INT       NOT NULL,
    aggregated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
