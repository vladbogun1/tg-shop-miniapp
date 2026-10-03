-- ============================================================
--  После заполнения (V18_1) slug обязателен и уникален.
-- ============================================================

ALTER TABLE products
    MODIFY COLUMN slug VARCHAR(160) NOT NULL,
    ADD UNIQUE KEY ux_products_slug (slug);

ALTER TABLE tags
    MODIFY COLUMN slug VARCHAR(160) NOT NULL,
    ADD UNIQUE KEY ux_tags_slug (slug);
