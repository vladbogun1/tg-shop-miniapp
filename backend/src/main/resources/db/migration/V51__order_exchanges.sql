-- ============================================================
--  Обмен товара по уже оплаченному заказу: покупатель вернул часть товаров,
--  взамен отправляем другие — в том же заказе, без нового. Заказ уходит обратно
--  в «Новый» (или «Одобрен»), получает новую ТТН; здесь остаётся след каждого
--  обмена: что вернули (и вернули ли в оборот), что выдали взамен, старая ТТН
--  и сумма до/после.
-- ============================================================

CREATE TABLE order_exchanges (
    id                   BIGINT        NOT NULL AUTO_INCREMENT,
    order_id             BINARY(16)    NOT NULL,
    created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Статус и ТТН заказа до обмена (новую ТТН впишут при повторной отправке).
    previous_status      VARCHAR(16)   NOT NULL,
    previous_tracking    VARCHAR(128)  NULL,
    -- «Мышь X ×1 (на склад); Коврик Y ×1 (списано)» — снимок для истории.
    returned_summary     VARCHAR(2000) NOT NULL,
    given_summary        VARCHAR(2000) NOT NULL,
    total_before_minor   BIGINT        NOT NULL,
    total_after_minor    BIGINT        NOT NULL,
    note                 VARCHAR(500)  NULL,
    admin_name           VARCHAR(255)  NULL,
    PRIMARY KEY (id),
    KEY idx_order_exchanges_order (order_id, created_at),
    CONSTRAINT fk_order_exchanges_order FOREIGN KEY (order_id)
        REFERENCES orders (id) ON DELETE CASCADE
);
