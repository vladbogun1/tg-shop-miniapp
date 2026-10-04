-- ============================================================
--  Настройки магазина, которые админ меняет из админки (раздел «Настройки»).
--
--  Секреты и инфраструктура (токены, пароли, ключи, URL сервисов) остаются в .env —
--  здесь только бизнес-параметры. Список допустимых ключей, их типы, диапазоны и
--  значения по умолчанию живут в коде (SettingsRegistry): нет строки — действует
--  значение по умолчанию, поэтому пустая таблица = поведение как до миграции.
--
--  Служебные ключи `system.*` (например, время последнего синка Новой Почты) пишет
--  сам бэкенд; в редакторе настроек они не показываются.
-- ============================================================

CREATE TABLE shop_settings (
    setting_key     VARCHAR(64)  NOT NULL,
    setting_value   TEXT         NULL,
    -- INT / BOOL / STRING / TEXT (по SettingsRegistry) или SYSTEM для служебных ключей.
    value_type      VARCHAR(16)  NOT NULL,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- telegram_user_id админа; NULL — запись сделал сам бэкенд.
    updated_by      BIGINT       NULL,
    -- Имя на момент правки (админа могут переименовать).
    updated_by_name VARCHAR(255) NULL,
    PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
