-- ============================================================
--  Двухфакторный вход в админку (TOTP), блокировка учётки, доверенные
--  устройства, история входов, аварийный сброс главного админа.
--
--  Вход теперь в два шага: пароль или Telegram → короткий pre-auth токен →
--  код из приложения-аутентификатора (или доверенное устройство) → ADMIN JWT.
--  Подробно: docs/ADMIN-2FA.md.
-- ============================================================

ALTER TABLE admin_users
    -- Секрет TOTP, зашифрованный AES-256-GCM (ключ ADMIN_2FA_KEY), формат «v1:base64».
    ADD COLUMN totp_secret_enc   VARCHAR(255) NULL,
    ADD COLUMN totp_enabled_at   TIMESTAMP    NULL,
    -- Новый секрет на время настройки/перенастройки (до подтверждения кодом).
    ADD COLUMN totp_pending_enc  VARCHAR(255) NULL,
    ADD COLUMN totp_pending_at   TIMESTAMP    NULL,
    -- Номер 30-секундного шага последнего принятого кода: тот же код второй раз не пройдёт.
    ADD COLUMN totp_last_step    BIGINT       NULL,
    -- Неверных паролей/кодов подряд; на 5-м учётка блокируется до locked_until (15 мин).
    ADD COLUMN failed_attempts   INT          NOT NULL DEFAULT 0,
    ADD COLUMN locked_until      TIMESTAMP    NULL,
    ADD COLUMN password_changed_at TIMESTAMP  NULL;

-- Все выданные до релиза ADMIN-токены перестают действовать: каждый админ
-- входит заново и проходит настройку 2FA.
UPDATE admin_users SET token_version = token_version + 1;

-- «Доверять этому устройству 30 дней»: в httpOnly-cookie лежит случайный токен,
-- здесь — только его SHA-256 и описание устройства (для «Забыть все устройства»).
CREATE TABLE admin_trusted_devices (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    admin_id      BIGINT       NOT NULL,
    token_hash    CHAR(64)     NOT NULL,
    -- token_version админа на момент выдачи: «выйти везде»/смена пароля обнуляют доверие.
    token_version INT          NOT NULL,
    device_label  VARCHAR(120) NULL,
    user_agent    VARCHAR(255) NULL,
    ip            VARCHAR(45)  NULL,
    city          VARCHAR(160) NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at  TIMESTAMP    NULL,
    expires_at    TIMESTAMP    NOT NULL,
    revoked_at    TIMESTAMP    NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_admin_trusted_token (token_hash),
    KEY idx_admin_trusted_admin (admin_id, revoked_at, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- История входов (экран «Мой аккаунт»), хранится 90 дней (AdminLoginLogService.purge).
CREATE TABLE admin_login_log (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    admin_id      BIGINT       NULL,               -- NULL: логин не найден / не админ
    login         VARCHAR(128) NULL,               -- что ввели в поле «Логин»
    method        VARCHAR(16)  NOT NULL,           -- PASSWORD / TELEGRAM
    result        VARCHAR(24)  NOT NULL,           -- OK / BAD_PASSWORD / BAD_CODE / LOCKED / ...
    second_factor VARCHAR(16)  NULL,               -- TOTP / TRUSTED_DEVICE / SETUP
    ip            VARCHAR(45)  NULL,
    country       VARCHAR(100) NULL,
    city          VARCHAR(120) NULL,
    user_agent    VARCHAR(255) NULL,
    device_label  VARCHAR(120) NULL,
    new_device    BOOLEAN      NOT NULL DEFAULT FALSE,
    new_city      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_admin_login_admin (admin_id, created_at),
    KEY idx_admin_login_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Выполненные аварийные сбросы (ADMIN_EMERGENCY_RESET=true): marker = HMAC от
-- ADMIN_PASSWORD, чтобы сброс с тем же паролем не повторялся на каждом рестарте.
CREATE TABLE admin_emergency_resets (
    id         BIGINT    NOT NULL AUTO_INCREMENT,
    admin_id   BIGINT    NOT NULL,
    marker     CHAR(64)  NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_admin_emergency_marker (marker)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
