-- ============================================================
--  Подарок за сумму заказа и кейсы (как в CS), GiftService, docs/GIFT-CASE.md.
--
--  Подарок за сумму: заказ от порога gift.thresholdUah получает товар gift.productId (цена 0) —
--    order_items.auto_gift = 1 (поставлен сам, gift = 1). Включается настройкой gift.enabled.
--
--  Кейсы — три уровня: BRONZE / SILVER / GOLD (gift_case_tiers), у каждого свой порог суммы
--  заказа и свой пул призов. Заказ получает самый дорогой уровень, до которого дотянул.
--  Перед оформлением покупатель выбирает: гарантированная скидка уровня (guaranteed_percent,
--  с потолком guaranteed_max_uah — сразу на этот заказ) ИЛИ крутить кейс. 0 % = выбора нет.
--
--  Приз определяет сервер при оформлении (взвешенный случайный выбор среди призов уровня в
--  наличии). Приз-товар сразу кладётся в заказ (склад и сборка видят его); приз-скидка — личный
--  промокод на следующий заказ, выдаётся при открытии. Покупателю приз показывается только после
--  открытия, а шансы не показываются вовсе.
--
--  Если выпал товар, похожий на купленный (тот же товар или та же категория в его заказах),
--  покупатель может заменить его на скидку: swap_percent от цены приза личным промокодом.
--
--  gift_case_tiers — уровни: порог, гарантированная скидка, процент замены, срок промокодов кейса
--    (promo_valid_days: приз-скидка и замена приза, дней от выдачи кода).
--  gift_case_items — призы: уровень, вид (PRODUCT — товар, DISCOUNT — скидка % или ₴), редкость
--    (COMMON/RARE/EPIC/LEGENDARY/GOLD — цвет рамки), вес (шанс = вес / сумма весов призов уровня
--    в наличии). Включается настройкой gift.caseEnabled.
--  orders.gift_case_status — NULL (кейса нет) | SEALED (приз выпал, кейс не открыт) | OPENED.
--  orders.gift_tier — уровень кейса или гарантированной скидки заказа.
--  orders.gift_discount_minor — часть discount_minor, данная гарантированной скидкой.
--  order_gift_cases — что выпало: вид, редкость, товар/скидка, выданный промокод, замена.
--  order_items.case_rarity — редкость выпавшего приза-товара (строка с auto_gift = 1).
--
--  Только добавление: старый бэкенд эти колонки не читает (откат образами).
-- ============================================================

CREATE TABLE gift_case_tiers (
    tier               VARCHAR(8) NOT NULL,
    enabled            BOOLEAN    NOT NULL DEFAULT TRUE,
    threshold_uah      INT        NOT NULL,
    guaranteed_percent INT        NOT NULL DEFAULT 0,
    guaranteed_max_uah INT        NOT NULL DEFAULT 0,
    swap_percent       INT        NOT NULL DEFAULT 0,
    promo_valid_days   INT        NOT NULL DEFAULT 30,
    updated_at         TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (tier)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

INSERT INTO gift_case_tiers (tier, enabled, threshold_uah, guaranteed_percent, guaranteed_max_uah, swap_percent, promo_valid_days) VALUES
    ('BRONZE', TRUE, 1500, 3, 100, 50, 14),
    ('SILVER', TRUE, 3000, 5, 250, 50, 30),
    ('GOLD',   TRUE, 6000, 7, 600, 60, 60);

CREATE TABLE gift_case_items (
    id                  BIGINT      NOT NULL AUTO_INCREMENT,
    tier                VARCHAR(8)  NOT NULL DEFAULT 'SILVER',
    kind                VARCHAR(8)  NOT NULL DEFAULT 'PRODUCT',
    product_id          BINARY(16)  NULL,
    discount_percent    INT         NOT NULL DEFAULT 0,
    discount_uah        INT         NOT NULL DEFAULT 0,
    rarity              VARCHAR(16) NOT NULL DEFAULT 'COMMON',
    weight              INT         NOT NULL DEFAULT 10,
    sort_order          INT         NOT NULL DEFAULT 0,
    active              BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_gift_case_items_tier_product (tier, product_id),
    KEY idx_gift_case_items_tier (tier, sort_order),
    CONSTRAINT fk_gift_case_items_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

ALTER TABLE orders
    ADD COLUMN gift_case_status    VARCHAR(16) NULL AFTER discount_minor,
    ADD COLUMN gift_case_opened_at TIMESTAMP   NULL AFTER gift_case_status,
    ADD COLUMN gift_tier           VARCHAR(8)  NULL AFTER gift_case_opened_at,
    ADD COLUMN gift_discount_minor BIGINT      NOT NULL DEFAULT 0 AFTER gift_tier;

ALTER TABLE order_items
    ADD COLUMN auto_gift   BOOLEAN     NOT NULL DEFAULT FALSE AFTER gift,
    ADD COLUMN case_rarity VARCHAR(16) NULL AFTER auto_gift;

CREATE TABLE order_gift_cases (
    order_id              BINARY(16)   NOT NULL,
    tier                  VARCHAR(8)   NOT NULL,
    case_item_id          BIGINT       NULL,
    kind                  VARCHAR(8)   NOT NULL,
    rarity                VARCHAR(16)  NOT NULL,
    product_id            BINARY(16)   NULL,
    title                 VARCHAR(255) NULL,
    discount_percent      INT          NOT NULL DEFAULT 0,
    discount_amount_minor BIGINT       NOT NULL DEFAULT 0,
    promo_code            VARCHAR(64)  NULL,
    swapped_at            TIMESTAMP    NULL,
    swap_amount_minor     BIGINT       NOT NULL DEFAULT 0,
    created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (order_id),
    CONSTRAINT fk_order_gift_cases_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
