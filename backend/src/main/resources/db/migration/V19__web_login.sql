-- ============================================================
--  Вход на сайт через бота + сессии сайта.
--
--  web_login_tokens — одноразовые заявки на вход (живут 5 минут). В базе только
--  SHA-256 от nonce (уходит в deep link) и от login_bind (HttpOnly-cookie
--  браузера, который начал вход): утёкшая строка таблицы не даёт войти.
--
--  web_sessions — долгие сессии сайта (refresh-токен в cookie, в базе SHA-256).
--  Отзыв = revoked_at; чистятся по расписанию (WebAuthService.cleanup).
-- ============================================================

CREATE TABLE web_login_tokens (
    id               BINARY(16)   NOT NULL,
    nonce_hash       CHAR(64)     NOT NULL,
    bind_hash        CHAR(64)     NOT NULL,
    match_code       TINYINT      NOT NULL,
    status           ENUM('PENDING','CONFIRMED','REJECTED','USED','EXPIRED') NOT NULL DEFAULT 'PENDING',
    telegram_user_id BIGINT       NULL,
    user_agent       VARCHAR(512) NULL,
    ip               VARCHAR(64)  NULL,
    bot_chat_id      BIGINT       NULL,
    bot_message_id   INT          NULL,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at       TIMESTAMP    NOT NULL,
    confirmed_at     TIMESTAMP    NULL,
    used_at          TIMESTAMP    NULL,
    PRIMARY KEY (id),
    UNIQUE KEY ux_web_login_tokens_nonce (nonce_hash),
    KEY idx_web_login_tokens_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE web_sessions (
    id           BINARY(16)   NOT NULL,
    user_id      BIGINT       NOT NULL,
    refresh_hash CHAR(64)     NOT NULL,
    user_agent   VARCHAR(512) NULL,
    ip           VARCHAR(64)  NULL,
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at   TIMESTAMP    NOT NULL,
    revoked_at   TIMESTAMP    NULL,
    PRIMARY KEY (id),
    UNIQUE KEY ux_web_sessions_refresh (refresh_hash),
    KEY idx_web_sessions_user (user_id, revoked_at),
    KEY idx_web_sessions_expires (expires_at),
    CONSTRAINT fk_web_sessions_user FOREIGN KEY (user_id)
        REFERENCES users (telegram_user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
