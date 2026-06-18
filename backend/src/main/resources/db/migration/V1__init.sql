-- ============================================================
--  tg-shop-v2 — начальная схема (чистая, всё через Flyway)
--  Деньги: целые минорные единицы (*_minor). UUID: BINARY(16).
-- ============================================================

-- ---------- Пользователи ----------
CREATE TABLE users (
    telegram_user_id BIGINT       NOT NULL,
    username         VARCHAR(255)  NULL,
    first_name       VARCHAR(255)  NULL,
    last_name        VARCHAR(255)  NULL,
    created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at     TIMESTAMP     NULL,
    PRIMARY KEY (telegram_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admin_users (
    telegram_user_id BIGINT      NOT NULL,
    name             VARCHAR(255) NULL,
    role             ENUM('ADMIN','SUPER_ADMIN') NOT NULL DEFAULT 'ADMIN',
    active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (telegram_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Каталог ----------
CREATE TABLE products (
    id           BINARY(16)   NOT NULL,
    title        VARCHAR(255) NOT NULL,
    description  TEXT         NULL,
    price_minor  BIGINT       NOT NULL,
    currency     VARCHAR(8)   NOT NULL DEFAULT 'UAH',
    stock        INT          NOT NULL DEFAULT 0,
    active       BOOLEAN      NOT NULL DEFAULT TRUE,
    archived     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_products_active_archived (active, archived),
    KEY idx_products_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_images (
    id          BIGINT        NOT NULL AUTO_INCREMENT,
    product_id  BINARY(16)    NOT NULL,
    url         VARCHAR(2048) NOT NULL,
    sort_order  INT           NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_product_images_product (product_id),
    CONSTRAINT fk_product_images_product FOREIGN KEY (product_id)
        REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_variants (
    id          BINARY(16)   NOT NULL,
    product_id  BINARY(16)   NOT NULL,
    name        VARCHAR(128) NOT NULL,
    stock       INT          NOT NULL DEFAULT 0,
    sort_order  INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_product_variants_product (product_id),
    CONSTRAINT fk_product_variants_product FOREIGN KEY (product_id)
        REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tags (
    id         BINARY(16)   NOT NULL,
    name       VARCHAR(128) NOT NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY ux_tags_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_tags (
    product_id BINARY(16) NOT NULL,
    tag_id     BINARY(16) NOT NULL,
    PRIMARY KEY (product_id, tag_id),
    CONSTRAINT fk_product_tags_product FOREIGN KEY (product_id)
        REFERENCES products (id) ON DELETE CASCADE,
    CONSTRAINT fk_product_tags_tag FOREIGN KEY (tag_id)
        REFERENCES tags (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Промокоды ----------
CREATE TABLE promo_codes (
    id                    BINARY(16)  NOT NULL,
    code                  VARCHAR(64) NOT NULL,
    discount_percent      INT         NOT NULL DEFAULT 0,
    discount_amount_minor BIGINT      NOT NULL DEFAULT 0,
    max_uses              INT         NULL,
    uses_count            INT         NOT NULL DEFAULT 0,
    active                BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY ux_promo_codes_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Оплата ----------
CREATE TABLE payment_options (
    id                BINARY(16)   NOT NULL,
    title             VARCHAR(255) NOT NULL,
    description       VARCHAR(1024) NULL,
    requires_prepayment BOOLEAN    NOT NULL DEFAULT FALSE,
    prepayment_minor  BIGINT       NOT NULL DEFAULT 0,
    sort_order        INT          NOT NULL DEFAULT 0,
    active            BOOLEAN      NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payment_requisites (
    id          INT           NOT NULL DEFAULT 1,
    card_number VARCHAR(64)   NULL,
    iban        VARCHAR(64)   NULL,
    recipient   VARCHAR(255)  NULL,
    edrpou      VARCHAR(32)   NULL,
    purpose     VARCHAR(255)  NULL,
    note        VARCHAR(2048) NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Заказы ----------
CREATE TABLE orders (
    id              BINARY(16)   NOT NULL,
    user_id         BIGINT       NULL,
    subtotal_minor  BIGINT       NOT NULL DEFAULT 0,
    discount_minor  BIGINT       NOT NULL DEFAULT 0,
    total_minor     BIGINT       NOT NULL,
    promo_code      VARCHAR(64)  NULL,
    currency        VARCHAR(8)   NOT NULL DEFAULT 'UAH',
    customer_name   VARCHAR(255) NOT NULL,
    phone           VARCHAR(64)  NOT NULL,
    comment         VARCHAR(1024) NULL,
    status          ENUM('NEW','APPROVED','SHIPPED','DELIVERED','REJECTED') NOT NULL DEFAULT 'NEW',
    tracking_number VARCHAR(128) NULL,
    reject_reason   VARCHAR(1024) NULL,
    -- доставка
    delivery_method   ENUM('NOVA_POSHTA','PICKUP') NOT NULL DEFAULT 'NOVA_POSHTA',
    np_city_ref       VARCHAR(64)  NULL,
    np_city_name      VARCHAR(255) NULL,
    np_warehouse_ref  VARCHAR(64)  NULL,
    np_warehouse_name VARCHAR(512) NULL,
    -- оплата
    payment_option_id BINARY(16)   NULL,
    payment_option_title VARCHAR(255) NULL,
    -- Telegram (снимок профиля + уведомления в каналы)
    tg_user_id      BIGINT       NULL,
    tg_username     VARCHAR(255) NULL,
    notify_chat_id    BIGINT     NULL,
    notify_thread_id  INT        NULL,
    notify_message_id INT        NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_orders_status (status),
    KEY idx_orders_user (user_id),
    KEY idx_orders_created_at (created_at),
    CONSTRAINT fk_orders_user FOREIGN KEY (user_id)
        REFERENCES users (telegram_user_id) ON DELETE SET NULL,
    CONSTRAINT fk_orders_payment_option FOREIGN KEY (payment_option_id)
        REFERENCES payment_options (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_items (
    id                    BIGINT       NOT NULL AUTO_INCREMENT,
    order_id              BINARY(16)   NOT NULL,
    product_id            BINARY(16)   NOT NULL,
    title_snapshot        VARCHAR(255) NOT NULL,
    price_minor_snapshot  BIGINT       NOT NULL,
    variant_id            BINARY(16)   NULL,
    variant_name_snapshot VARCHAR(128) NULL,
    quantity              INT          NOT NULL,
    PRIMARY KEY (id),
    KEY idx_order_items_order (order_id),
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id)
        REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Чат заказа ----------
CREATE TABLE order_messages (
    id                  BIGINT       NOT NULL AUTO_INCREMENT,
    order_id            BINARY(16)   NOT NULL,
    sender_type         ENUM('CUSTOMER','ADMIN','SYSTEM') NOT NULL,
    sender_id           BIGINT       NULL,
    sender_name         VARCHAR(255) NULL,
    type                ENUM('TEXT','PHOTO','FILE','SYSTEM') NOT NULL DEFAULT 'TEXT',
    text                VARCHAR(8192) NULL,
    attachment_url      VARCHAR(2048) NULL,
    file_name           VARCHAR(512) NULL,
    mime_type           VARCHAR(128) NULL,
    width               INT          NULL,
    height              INT          NULL,
    reply_to_message_id BIGINT       NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivered_at        TIMESTAMP    NULL,
    read_at             TIMESTAMP    NULL,
    PRIMARY KEY (id),
    KEY idx_order_messages_order (order_id, created_at),
    CONSTRAINT fk_order_messages_order FOREIGN KEY (order_id)
        REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Настройки (key/value) ----------
CREATE TABLE settings (
    k VARCHAR(128)  NOT NULL,
    v TEXT          NOT NULL,
    PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Новая Почта (справочник, синк раз в день) ----------
CREATE TABLE nova_poshta_cities (
    ref        VARCHAR(64)  NOT NULL,
    name       VARCHAR(255) NOT NULL,
    area       VARCHAR(255) NULL,
    updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (ref),
    KEY idx_np_cities_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE nova_poshta_warehouses (
    ref         VARCHAR(64)  NOT NULL,
    city_ref    VARCHAR(64)  NOT NULL,
    city_name   VARCHAR(255) NULL,
    number      VARCHAR(32)  NULL,
    description VARCHAR(512) NULL,
    type        VARCHAR(64)  NULL,
    lat         DOUBLE       NULL,
    lng         DOUBLE       NULL,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (ref),
    KEY idx_np_wh_city (city_ref),
    KEY idx_np_wh_city_name (city_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
