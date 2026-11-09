-- Метка «проблемный покупатель» (09.11.2026): покупатель кинул магазин (не забрал наложку, пропал после отправки).
-- Админ ставит метку с причиной в «Пользователях»; в заказе и в карточке Telegram видно красное предупреждение,
-- а сам покупатель может оформить заказ только с полной оплатой онлайн (без предоплаты и остатка наложкой).
-- Одна строка на Telegram-id; снятие метки удаляет строку, кто и когда ставил/снимал — в журнале админов.
-- Только добавляет: старый бэкенд таблицу не знает и не трогает, откат — образами (infra/rollback.sh).
-- Убрать при желании: DROP TABLE customer_flags;
CREATE TABLE customer_flags (
    telegram_user_id    BIGINT        NOT NULL,
    reason              VARCHAR(500)  NOT NULL,
    flagged_at          TIMESTAMP(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    flagged_by_admin_id BIGINT        NULL,
    PRIMARY KEY (telegram_user_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
