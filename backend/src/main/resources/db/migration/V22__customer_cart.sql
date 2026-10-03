-- ============================================================
--  Серверная корзина покупателя (сайт + Mini App, один Telegram-аккаунт).
--
--  carts — одна строка на покупателя: номер версии корзины (растёт при каждой
--  записи — клиенты по нему понимают, что корзину поменяли на другом устройстве)
--  и строка-замок: все записи в корзину одного покупателя идут через
--  SELECT ... FOR UPDATE по ней, поэтому слияние и замена не гоняются друг с другом.
--
--  cart_items — строки корзины. Вариант может быть NULL (товар без вариантов),
--  а в MySQL UNIQUE с NULL не срабатывает (две строки с NULL — «разные»), поэтому
--  уникальность держится по виртуальной колонке variant_key = IFNULL(variant_id, нули).
--  Колонка именно VIRTUAL: MySQL запрещает ON DELETE CASCADE на базовой колонке
--  STORED-колонки, а каскад нужен — удалили товар/вариант в админке, строка ушла сама.
--
--  Лимиты (100 строк, 1–99 шт.) проверяет CartService; CHECK — последняя страховка.
-- ============================================================

CREATE TABLE carts (
    user_id    BIGINT       NOT NULL,
    version    BIGINT       NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (user_id),
    CONSTRAINT fk_carts_user FOREIGN KEY (user_id)
        REFERENCES users (telegram_user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cart_items (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    user_id     BIGINT       NOT NULL,
    product_id  BINARY(16)   NOT NULL,
    variant_id  BINARY(16)   NULL,
    variant_key BINARY(16)   AS (IFNULL(variant_id, 0x00000000000000000000000000000000)) VIRTUAL,
    qty         INT          NOT NULL,
    added_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY ux_cart_items_line (user_id, product_id, variant_key),
    KEY idx_cart_items_product (product_id),
    KEY idx_cart_items_variant (variant_id),
    CONSTRAINT ck_cart_items_qty CHECK (qty BETWEEN 1 AND 99),
    CONSTRAINT fk_cart_items_cart FOREIGN KEY (user_id)
        REFERENCES carts (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_cart_items_product FOREIGN KEY (product_id)
        REFERENCES products (id) ON DELETE CASCADE,
    CONSTRAINT fk_cart_items_variant FOREIGN KEY (variant_id)
        REFERENCES product_variants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
