-- ============================================================
--  Подарок за сумму заказа и кейс (как в CS), GiftService, docs/GIFT-CASE.md.
--
--  Подарок за сумму: заказ от порога gift.thresholdUah получает товар gift.productId (цена 0) —
--    order_items.auto_gift = 1 (поставлен сам, gift = 1). Включается настройкой gift.enabled.
--
--  Кейс (как в CS): покупатель «открывает» кейс, лента крутится и
--  останавливается на призе. Приз определяет сервер при оформлении заказа (взвешенный случайный
--  выбор среди товаров в наличии) и сразу кладёт его в заказ — склад и сборка видят его как обычный
--  подарок; покупателю он показывается только после открытия.
--
--  gift_case_items — призы кейса: товар, редкость (COMMON/RARE/EPIC/LEGENDARY/GOLD — цвет рамки),
--    вес (шанс = вес / сумма весов призов в наличии). Включается настройкой gift.caseEnabled.
--  orders.gift_case_status — NULL (кейса нет) | SEALED (приз выпал, кейс не открыт) | OPENED.
--  order_items.case_rarity — редкость выпавшего приза (строка с auto_gift = 1).
--
--  Только добавление: старый бэкенд эти колонки не читает (откат образами).
-- ============================================================

CREATE TABLE gift_case_items (
    id          BIGINT      NOT NULL AUTO_INCREMENT,
    product_id  BINARY(16)  NOT NULL,
    rarity      VARCHAR(16) NOT NULL DEFAULT 'COMMON',
    weight      INT         NOT NULL DEFAULT 10,
    sort_order  INT         NOT NULL DEFAULT 0,
    active      BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_gift_case_items_product (product_id),
    CONSTRAINT fk_gift_case_items_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

ALTER TABLE orders
    ADD COLUMN gift_case_status    VARCHAR(16) NULL AFTER discount_minor,
    ADD COLUMN gift_case_opened_at TIMESTAMP   NULL AFTER gift_case_status;

ALTER TABLE order_items
    ADD COLUMN auto_gift   BOOLEAN     NOT NULL DEFAULT FALSE AFTER gift,
    ADD COLUMN case_rarity VARCHAR(16) NULL AFTER auto_gift;
