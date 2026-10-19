-- ============================================================
--  «Вместе дешевле» (BundleService, docs/BUNDLES.md).
--
--  bundle_rules — «к товару из категории A предлагать товары категории B». Категория правила
--    совпадает и со своими подкатегориями (Коврики → Тканевые, Магнитные, Стеклянные).
--    Аксессуар со скидкой — строка корзины из B при товаре из A подороже (цена аксессуара не выше
--    bundle.maxAddonPricePercent % от основного). Проценты и пороги — в shop_settings (bundle.*).
--  orders.bundle_discount_minor — часть discount_minor, которая пришла от комплекта (0 = промокод
--    или ручная скидка). Скидка у заказа одна: комплект или промокод, что выгоднее покупателю.
--  order_items.bundle_addon — строка получила скидку комплекта (метка в админке).
--
--  Только добавление: старый бэкенд эти колонки не читает и стартует с WARN (откат образами).
-- ============================================================

CREATE TABLE bundle_rules (
    id                 BIGINT       NOT NULL AUTO_INCREMENT,
    source_category_id BINARY(16)   NOT NULL,
    target_category_id BINARY(16)   NOT NULL,
    sort_order         INT          NOT NULL DEFAULT 0,
    active             BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bundle_rules_pair (source_category_id, target_category_id),
    CONSTRAINT fk_bundle_rules_source FOREIGN KEY (source_category_id) REFERENCES categories (id) ON DELETE CASCADE,
    CONSTRAINT fk_bundle_rules_target FOREIGN KEY (target_category_id) REFERENCES categories (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

ALTER TABLE orders
    ADD COLUMN bundle_discount_minor BIGINT NOT NULL DEFAULT 0 AFTER discount_minor;

ALTER TABLE order_items
    ADD COLUMN bundle_addon BOOLEAN NOT NULL DEFAULT FALSE AFTER gift;

-- Стартовые пары — из заказов (2026-10): коврик + рукав/глайды, мышь + глайды/коврик/рукав,
-- клавиатура + кейкапы/кабель, наушники + рукав/кабель. По именам категорий: на базе без каталога
-- (тесты, пустой стенд) ничего не вставится. Правится в админке «Вместе дешевле».
INSERT INTO bundle_rules (source_category_id, target_category_id, sort_order)
SELECT s.id, t.id, r.sort_order
  FROM (SELECT 'Мыши' AS src, 'Глайды' AS tgt, 10 AS sort_order
        UNION ALL SELECT 'Мыши', 'Коврики', 20
        UNION ALL SELECT 'Мыши', 'Рукава', 30
        UNION ALL SELECT 'Коврики', 'Рукава', 40
        UNION ALL SELECT 'Коврики', 'Глайды', 50
        UNION ALL SELECT 'Клавиатуры', 'Кейкапы', 60
        UNION ALL SELECT 'Клавиатуры', 'Кабели', 70
        UNION ALL SELECT 'Наушники', 'Рукава', 80
        UNION ALL SELECT 'Наушники', 'Кабели', 90) r
  JOIN categories s ON s.name = r.src
  JOIN categories t ON t.name = r.tgt
 WHERE s.id <> t.id;
