-- ============================================================
--  «Разом дешевше» 2.0 (docs/BUNDLES.md, обзор docs/research/bundles-rethink.html).
--
--  bundle_category_margins — маржа категории (оценка владельца, % от цены) и скидка, которую можно
--    дать на её товары как на аксессуар: не больше «маржа − страховка» (bundle.safetyMarginPercent).
--    margin_percent NULL = средняя маржа gift.marginPercent; discount_percent — ручной предел владельца
--    (NULL = автонастройка / «маржа − страховка»); auto_percent — что посчитала автонастройка.
--    Строка подкатегории важнее строки родителя.
--  bundle_setup_rules — «Собери сетап»: к большому товару (мышь) предлагать другие большие
--    (клавиатура, наушники). Отдельная таблица, а не флаг в bundle_rules: старый бэкенд при откате
--    не должен принять эти пары за аксессуары со скидкой.
--  bundle_rules += «Клавиатуры → Коврики» (вместе в 16,5 % заказов с клавиатурой).
--
--  Только добавление: старый бэкенд новые таблицы не читает (откат образами).
-- ============================================================

CREATE TABLE bundle_category_margins (
    category_id      BINARY(16) NOT NULL,
    margin_percent   INT        NULL,
    discount_percent INT        NULL,
    auto_percent     INT        NULL,
    auto_updated_at  TIMESTAMP  NULL,
    updated_at       TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (category_id),
    CONSTRAINT fk_bundle_margins_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE bundle_setup_rules (
    id                 BIGINT     NOT NULL AUTO_INCREMENT,
    source_category_id BINARY(16) NOT NULL,
    target_category_id BINARY(16) NOT NULL,
    sort_order         INT        NOT NULL DEFAULT 0,
    active             BOOLEAN    NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bundle_setup_rules_pair (source_category_id, target_category_id),
    CONSTRAINT fk_bundle_setup_source FOREIGN KEY (source_category_id) REFERENCES categories (id) ON DELETE CASCADE,
    CONSTRAINT fk_bundle_setup_target FOREIGN KEY (target_category_id) REFERENCES categories (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Сетап: мышь + клавиатура (17 заказов вместе), мышь + наушники (17), клавиатура + наушники (16).
INSERT INTO bundle_setup_rules (source_category_id, target_category_id, sort_order)
SELECT s.id, t.id, r.sort_order
  FROM (SELECT 'Мыши' AS src, 'Клавиатуры' AS tgt, 10 AS sort_order
        UNION ALL SELECT 'Мыши', 'Наушники', 20
        UNION ALL SELECT 'Клавиатуры', 'Мыши', 30
        UNION ALL SELECT 'Клавиатуры', 'Наушники', 40
        UNION ALL SELECT 'Наушники', 'Мыши', 50
        UNION ALL SELECT 'Наушники', 'Клавиатуры', 60) r
  JOIN categories s ON s.name = r.src AND s.parent_id IS NULL
  JOIN categories t ON t.name = r.tgt AND t.parent_id IS NULL
 WHERE s.id <> t.id;

INSERT INTO bundle_rules (source_category_id, target_category_id, sort_order)
SELECT s.id, t.id, 65
  FROM categories s
  JOIN categories t ON t.name = 'Коврики' AND t.parent_id IS NULL
 WHERE s.name = 'Клавиатуры' AND s.parent_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM bundle_rules b WHERE b.source_category_id = s.id AND b.target_category_id = t.id);
