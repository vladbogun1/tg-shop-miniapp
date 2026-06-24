-- Extra Telegram profile fields on users (captured from WebApp initData / bot /start)
-- plus bot-block tracking (set when a DM/broadcast fails with 403, cleared on next login).
ALTER TABLE users
    ADD COLUMN language_code  VARCHAR(16)  NULL          AFTER last_name,
    ADD COLUMN is_premium     BOOLEAN      NOT NULL DEFAULT FALSE AFTER language_code,
    ADD COLUMN photo_url      VARCHAR(512) NULL          AFTER is_premium,
    ADD COLUMN bot_blocked    BOOLEAN      NOT NULL DEFAULT FALSE AFTER photo_url,
    ADD COLUMN bot_blocked_at TIMESTAMP    NULL          AFTER bot_blocked;

-- Helpful indexes for the admin Users list / metrics.
CREATE INDEX idx_users_created_at ON users (created_at);
CREATE INDEX idx_users_bot_blocked ON users (bot_blocked);
