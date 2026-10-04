-- ============================================================
--  Отзыв отдельного admin-токена («Выйти» в админке).
--
--  Admin-JWT несёт jti (id токена). «Выйти» кладёт его jti сюда — этот токен
--  перестаёт приниматься сразу, а остальные устройства админа продолжают работать.
--  «Выйти на всех устройствах» по-прежнему делает admin_users.token_version + 1.
--
--  Строка нужна только до истечения самого токена (expires_at), потом её
--  удаляет плановая чистка (AdminTokenRevocations.cleanup).
-- ============================================================

CREATE TABLE admin_revoked_tokens (
    jti              CHAR(36)  NOT NULL,
    telegram_user_id BIGINT    NOT NULL,
    expires_at       TIMESTAMP NOT NULL,
    revoked_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (jti),
    KEY idx_admin_revoked_tokens_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
