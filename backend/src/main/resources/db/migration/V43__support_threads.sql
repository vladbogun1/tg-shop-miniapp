-- Поддержка: обращения покупателей, не привязанные к заказу (вопрос о товаре до покупки или общий
-- вопрос). Переписка устроена как чат заказа (order_messages), но живёт в своих таблицах: у
-- обращения нет заказа, зато есть статус OPEN/CLOSED, снимок товара и счётчики непрочитанного.

CREATE TABLE support_threads (
    id                BINARY(16)    NOT NULL,
    -- users.telegram_user_id покупателя (как orders.user_id); tg_user_id — куда писать ботом.
    user_id           BIGINT        NOT NULL,
    tg_user_id        BIGINT        NULL,
    customer_name     VARCHAR(255)  NULL,
    -- Товар, о котором спрашивают (NULL — общий вопрос). Снимок названия/slug/картинки остаётся,
    -- даже если товар потом переименуют или удалят.
    product_id        BINARY(16)    NULL,
    product_title     VARCHAR(255)  NULL,
    product_slug      VARCHAR(255)  NULL,
    product_image_url VARCHAR(2048) NULL,
    subject           VARCHAR(255)  NULL,
    status            ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
    -- Откуда пришло обращение: MINIAPP | WEB.
    source            VARCHAR(16)   NULL,
    last_message_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_sender       ENUM('CUSTOMER','ADMIN','SYSTEM') NULL,
    last_preview      VARCHAR(255)  NULL,
    -- Непрочитанные сообщения магазина у покупателя / сообщения покупателя у админов.
    customer_unread   INT           NOT NULL DEFAULT 0,
    admin_unread      INT           NOT NULL DEFAULT 0,
    -- Первое сообщение покупателя, на которое магазин ещё не ответил (NULL — ответа никто не ждёт).
    awaiting_since    TIMESTAMP     NULL,
    created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at         TIMESTAMP     NULL,
    -- Кто закрыл: CUSTOMER | ADMIN | AUTO.
    closed_by         VARCHAR(16)   NULL,
    PRIMARY KEY (id),
    KEY idx_support_threads_user (user_id, status, last_message_at),
    KEY idx_support_threads_status (status, last_message_at),
    KEY idx_support_threads_awaiting (awaiting_since),
    CONSTRAINT fk_support_threads_product FOREIGN KEY (product_id)
        REFERENCES products (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE support_messages (
    id                  BIGINT        NOT NULL AUTO_INCREMENT,
    thread_id           BINARY(16)    NOT NULL,
    sender_type         ENUM('CUSTOMER','ADMIN','SYSTEM') NOT NULL,
    sender_id           BIGINT        NULL,
    sender_name         VARCHAR(255)  NULL,
    type                ENUM('TEXT','PHOTO','FILE','SYSTEM') NOT NULL DEFAULT 'TEXT',
    text                VARCHAR(8192) NULL,
    attachment_url      VARCHAR(2048) NULL,
    file_name           VARCHAR(512)  NULL,
    mime_type           VARCHAR(128)  NULL,
    reply_to_message_id BIGINT        NULL,
    created_at          TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    read_at             TIMESTAMP     NULL,
    PRIMARY KEY (id),
    KEY idx_support_messages_thread (thread_id, id),
    -- Лимиты покупателя (пауза, сообщений в час) считаются по его сообщениям за последний час.
    KEY idx_support_messages_sender (sender_type, sender_id, created_at),
    CONSTRAINT fk_support_messages_thread FOREIGN KEY (thread_id)
        REFERENCES support_threads (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
