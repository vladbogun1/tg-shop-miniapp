-- ============================================================
--  Браузерная авторизация админов: логин + bcrypt-хэш пароля.
--  Привязывается к строке admin_users (PK telegram_user_id).
-- ============================================================

ALTER TABLE admin_users
    ADD COLUMN username      VARCHAR(128) NULL AFTER telegram_user_id,
    ADD COLUMN password_hash VARCHAR(255) NULL AFTER username;

-- Уникальный логин (NULL допускается для tg-only админов).
CREATE UNIQUE INDEX ux_admin_users_username ON admin_users (username);
