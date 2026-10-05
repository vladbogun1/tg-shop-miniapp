-- ============================================================
--  Этап 2 учёток админки: раздел «Админы» (только главный админ).
--
--  Приглашения: главный приглашает нового админа (NEW), выдаёт логин существующему
--  админу без пароля (CREDENTIALS) или сбрасывает пароль (PASSWORD_RESET). Бот присылает
--  ссылку https://admin…/invite/<токен>. В базе только SHA-256 токена; ссылка живёт 48 ч,
--  одноразовая и гасится только после подтверждения 2FA. Подробно: docs/ADMIN-2FA.md.
--
--  Внешних ключей на admin_users в схеме нет: журнал (admin_audit_log), чат заказов
--  (order_messages.sender_id), рассылки (broadcasts.admin_id) хранят id и снимок имени.
--  Поэтому «Удалить» в UI разрешено только админу без такой истории (иначе — «Заблокировать»).
-- ============================================================

CREATE TABLE admin_invites (
    id                     BIGINT       NOT NULL AUTO_INCREMENT,
    -- SHA-256 (hex) случайного токена из ссылки; сам токен нигде не хранится.
    token_hash             CHAR(64)     NOT NULL,
    -- NEW / CREDENTIALS / PASSWORD_RESET
    kind                   VARCHAR(16)  NOT NULL,
    -- Кому: Telegram id (= admin_users.telegram_user_id после принятия).
    telegram_user_id       BIGINT       NOT NULL,
    name                   VARCHAR(255) NULL,
    role                   VARCHAR(16)  NOT NULL DEFAULT 'ADMIN',
    invited_by             BIGINT       NOT NULL,
    created_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at             TIMESTAMP    NOT NULL,
    used_at                TIMESTAMP    NULL,
    revoked_at             TIMESTAMP    NULL,
    -- Бот доставил сообщение со ссылкой (иначе главный передал её сам).
    delivered              BOOLEAN      NOT NULL DEFAULT FALSE,
    -- Промежуточное состояние между «логин и пароль» и «код 2FA» (учётка ещё не активна).
    pending_username       VARCHAR(128) NULL,
    pending_password_hash  VARCHAR(255) NULL,
    -- Новый секрет TOTP, AES-256-GCM как admin_users.totp_secret_enc (AAD = telegram_user_id).
    pending_totp_enc       VARCHAR(255) NULL,
    pending_at             TIMESTAMP    NULL,
    -- Неверных кодов на шаге 2FA; на 5-м приглашение отзывается.
    failed_attempts        INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_admin_invite_token (token_hash),
    KEY idx_admin_invite_tg (telegram_user_id, used_at, revoked_at),
    KEY idx_admin_invite_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
