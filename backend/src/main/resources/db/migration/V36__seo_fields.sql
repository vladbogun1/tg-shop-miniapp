-- ============================================================
--  SEO-поля, которые владелец правит в админке (docs/SEO-AUDIT-TECH.md, раздел 5, пункты 3 и 5).
--
--  tags (категории сайта) — русский оригинал, переводы uk/en идут через content_translations
--  (entity_type TAG, поля seo_title / seo_description / h1 / intro_text):
--    seo_title       — <title> страницы категории; пусто = шаблон сайта (site/lib/seo.ts);
--    seo_description — meta description; пусто = шаблон с числом товаров и ценой «от»;
--    h1              — заголовок страницы; пусто = название категории;
--    intro_text      — SEO-текст категории (300–600 слов); на сайте пока не выводится.
--
--  products:
--    brand — бренд для schema.org Product.brand; пусто = эвристика сайта (строка «Бренд:» / название);
--    sku   — артикул; уникален, если задан (NULL не конфликтуют). Пусто = id товара.
--
--  Данные не заполняются: все колонки NULL, сайт работает на прежних шаблонах.
-- ============================================================

ALTER TABLE tags
    ADD COLUMN seo_title       VARCHAR(255) NULL,
    ADD COLUMN seo_description VARCHAR(512) NULL,
    ADD COLUMN h1              VARCHAR(255) NULL,
    ADD COLUMN intro_text      TEXT         NULL;

ALTER TABLE products
    ADD COLUMN brand VARCHAR(128) NULL,
    ADD COLUMN sku   VARCHAR(64)  NULL,
    ADD UNIQUE KEY ux_products_sku (sku);
