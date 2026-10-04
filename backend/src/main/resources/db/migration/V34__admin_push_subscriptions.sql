-- ============================================================
--  Web Push для админки-PWA: подписки устройств (телефон/ноутбук владельца).
--
--  Одна строка = один браузер/установленное приложение. endpoint — URL push-сервиса
--  (FCM / Apple / Mozilla / WNS), p256dh + auth — ключи шифрования из PushSubscription.
--  endpoint длинный (до ~1 КБ), поэтому уникальность — по SHA-256 от него.
--  Подписки, на которые push-сервис ответил 404/410, удаляются автоматически.
-- ============================================================

CREATE TABLE admin_push_subscriptions (
    id              BIGINT        NOT NULL AUTO_INCREMENT,
    -- Кто подписал устройство: subject админского JWT (admin PK / telegram_user_id).
    admin_id        BIGINT        NOT NULL,
    endpoint        VARCHAR(2048) NOT NULL,
    endpoint_hash   CHAR(64)      NOT NULL,
    p256dh          VARCHAR(255)  NOT NULL,
    auth            VARCHAR(64)   NOT NULL,
    user_agent      VARCHAR(255)  NULL,
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_success_at TIMESTAMP     NULL,
    -- Подряд неудачных отправок (не 404/410); сбрасывается при успехе.
    failures        INT           NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_admin_push_endpoint (endpoint_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
