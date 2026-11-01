-- Откат (старый бэкенд таблицу не читает, откат кода безопасен; саму таблицу можно оставить):
--   DROP TABLE order_idempotency;
--   ALTER TABLE orders DROP INDEX idx_orders_promo_code;
--   ALTER TABLE order_items DROP INDEX idx_order_items_product_qty;
--
-- Ключи идемпотентности оформления заказа. Раньше жили в памяти процесса (Caffeine, 30 минут):
-- два одновременных запроса с одним ключом оба видели «ключа нет» и создавали два заказа, а после
-- рестарта контейнера повтор с тем же ключом создавал дубль. Теперь строка ключа вставляется в той же
-- транзакции, что и заказ; уникальный (user_id, idem_key) не даёт второму запросу пройти.
CREATE TABLE order_idempotency (
    id         BIGINT       NOT NULL AUTO_INCREMENT,
    user_id    BIGINT       NOT NULL,
    idem_key   VARCHAR(128) NOT NULL,
    order_id   BINARY(16)   NULL,
    created_at DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY ux_order_idempotency_key (user_id, idem_key),
    KEY idx_order_idempotency_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Промокоды: OrderRepository считает заказы по promo_code (= и like 'prefix%'), страница «Промокоды» — по каждому коду.
ALTER TABLE orders ADD INDEX idx_orders_promo_code (promo_code);

-- «Продано» по товару (OrderItemRepository.soldCountsByProduct): group by product_id, sum(quantity), gift = 0.
ALTER TABLE order_items ADD INDEX idx_order_items_product_qty (product_id, gift, quantity);
