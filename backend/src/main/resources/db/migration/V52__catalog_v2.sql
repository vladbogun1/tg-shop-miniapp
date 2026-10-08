-- ============================================================
--  Каталог v2 (docs/CATALOG-SPECS.md §1): дерево категорий, справочник брендов,
--  типизированные характеристики (схема на категорию), состояние товара и статус
--  оформления карточки.
--
--  Перенос данных:
--   * теги → категории 1:1 (тот же id, slug, SEO), кроме «Уценки» (slug utsenka) — она
--     становится состоянием товара condition = MARKDOWN;
--   * products.category_id = первый тег товара, не «Уценка» (по sort_order, затем по имени);
--   * переводы TAG копируются как CATEGORY (тот же entity_id);
--   * бренды из текстового products.brand заполняет Java-миграция V52_1.
--  Старые tags / product_tags / products.brand НЕ удаляются (откат образа без восстановления БД),
--  код их больше не читает; удаление — отдельной миграцией после выкатки.
--  UPDATE products ставит updated_at = updated_at: перенос не должен «обновлять» товары (sitemap lastmod).
-- ============================================================

CREATE TABLE categories (
    id              BINARY(16)   NOT NULL,
    parent_id       BINARY(16)   NULL,
    name            VARCHAR(128) NOT NULL,
    slug            VARCHAR(160) NOT NULL,
    sort_order      INT          NOT NULL DEFAULT 0,
    show_in_menu    BOOLEAN      NOT NULL DEFAULT TRUE,
    art_kind        VARCHAR(32)  NULL,
    seo_title       VARCHAR(255) NULL,
    seo_description VARCHAR(512) NULL,
    h1              VARCHAR(255) NULL,
    intro_text      TEXT         NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY ux_categories_slug (slug),
    KEY idx_categories_parent (parent_id),
    CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO categories (id, parent_id, name, slug, sort_order, show_in_menu, seo_title, seo_description, h1,
                        intro_text, created_at)
SELECT t.id, NULL, t.name, t.slug, t.sort_order, t.show_in_menu, t.seo_title, t.seo_description, t.h1,
       t.intro_text, t.created_at
  FROM tags t
 WHERE t.slug <> 'utsenka';

CREATE TABLE brands (
    id         BINARY(16)   NOT NULL,
    name       VARCHAR(128) NOT NULL,
    slug       VARCHAR(160) NOT NULL,
    aliases    TEXT         NULL,
    website    VARCHAR(255) NULL,
    sort_order INT          NOT NULL DEFAULT 0,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY ux_brands_name (name),
    UNIQUE KEY ux_brands_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE spec_groups (
    `key`      VARCHAR(32) NOT NULL,
    label_ru   VARCHAR(64) NOT NULL,
    label_uk   VARCHAR(64) NOT NULL,
    label_en   VARCHAR(64) NOT NULL,
    sort_order INT         NOT NULL DEFAULT 0,
    PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE spec_attributes (
    id          BINARY(16)  NOT NULL,
    category_id BINARY(16)  NULL,
    `key`       VARCHAR(48) NOT NULL,
    label_ru    VARCHAR(96) NOT NULL,
    label_uk    VARCHAR(96) NOT NULL,
    label_en    VARCHAR(96) NOT NULL,
    type        ENUM('NUMBER','ENUM','MULTI','BOOL','TEXT') NOT NULL,
    unit_ru     VARCHAR(24) NULL,
    unit_uk     VARCHAR(24) NULL,
    unit_en     VARCHAR(24) NULL,
    is_range    BOOLEAN     NOT NULL DEFAULT FALSE,
    group_key   VARCHAR(32) NOT NULL,
    filterable  BOOLEAN     NOT NULL DEFAULT FALSE,
    comparable  BOOLEAN     NOT NULL DEFAULT FALSE,
    is_required BOOLEAN     NOT NULL DEFAULT FALSE,
    highlight   BOOLEAN     NOT NULL DEFAULT FALSE,
    sort_order  INT         NOT NULL DEFAULT 0,
    buckets     JSON        NULL,
    hint        TEXT        NULL,
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY ux_spec_attributes_category_key (category_id, `key`),
    CONSTRAINT fk_spec_attributes_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE spec_options (
    id           BINARY(16)  NOT NULL,
    attribute_id BINARY(16)  NOT NULL,
    value        VARCHAR(64) NOT NULL,
    label_ru     VARCHAR(96) NOT NULL,
    label_uk     VARCHAR(96) NOT NULL,
    label_en     VARCHAR(96) NOT NULL,
    aliases      TEXT        NULL,
    sort_order   INT         NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY ux_spec_options_attribute_value (attribute_id, value),
    CONSTRAINT fk_spec_options_attribute FOREIGN KEY (attribute_id) REFERENCES spec_attributes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE products
    ADD COLUMN category_id     BINARY(16)   NULL,
    ADD COLUMN brand_id        BINARY(16)   NULL,
    ADD COLUMN `condition`     ENUM('NEW','MARKDOWN','USED') NOT NULL DEFAULT 'NEW',
    ADD COLUMN condition_note  VARCHAR(255) NULL,
    ADD COLUMN specs           JSON         NULL,
    ADD COLUMN card_status     ENUM('DRAFT','AI_FILLED','READY') NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN card_confidence TINYINT      NULL,
    ADD COLUMN card_meta       JSON         NULL,
    ADD CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_products_brand FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE SET NULL;

UPDATE products p
   SET p.category_id = (SELECT t.id
                          FROM product_tags pt
                          JOIN tags t ON t.id = pt.tag_id
                         WHERE pt.product_id = p.id AND t.slug <> 'utsenka'
                         ORDER BY t.sort_order, t.name
                         LIMIT 1),
       p.updated_at = p.updated_at;

UPDATE products p
   SET p.`condition` = 'MARKDOWN',
       p.updated_at = p.updated_at
 WHERE EXISTS (SELECT 1 FROM product_tags pt JOIN tags t ON t.id = pt.tag_id
                WHERE pt.product_id = p.id AND t.slug = 'utsenka');

-- Все существующие карточки «требуют оформления» (DEFAULT 'DRAFT' уже это дал).

ALTER TABLE content_translations
    MODIFY entity_type ENUM('PRODUCT','VARIANT','TAG','PAYMENT_OPTION','REPLY_TEMPLATE','CATEGORY','BRAND') NOT NULL;

INSERT INTO content_translations (entity_type, entity_id, field, locale, text, source_hash, origin, updated_by)
SELECT 'CATEGORY', ct.entity_id, ct.field, ct.locale, ct.text, ct.source_hash, ct.origin, ct.updated_by
  FROM content_translations ct
 WHERE ct.entity_type = 'TAG'
   AND ct.entity_id IN (SELECT c.id FROM categories c)
ON DUPLICATE KEY UPDATE text = VALUES(text), source_hash = VALUES(source_hash);
