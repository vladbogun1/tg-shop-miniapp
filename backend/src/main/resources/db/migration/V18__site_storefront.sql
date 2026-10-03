-- ============================================================
--  Витрина сайта (этап 1): ЧПУ, старая цена, SEO, порядок категорий.
--
--  slug добавляется NULL — его заполняет Java-миграция V18_1 (транслит uk/ru,
--  уникальные суффиксы -2, -3…), а V18_2 делает колонки NOT NULL + UNIQUE.
--  Всё аддитивно: Mini App и админка эти поля просто не читают.
-- ============================================================

ALTER TABLE products
    ADD COLUMN slug             VARCHAR(160) NULL AFTER title,
    ADD COLUMN compare_at_minor BIGINT       NULL AFTER price_minor,
    ADD COLUMN seo_title        VARCHAR(255) NULL,
    ADD COLUMN seo_description  VARCHAR(512) NULL;

ALTER TABLE tags
    ADD COLUMN slug         VARCHAR(160) NULL AFTER name,
    ADD COLUMN sort_order   INT          NOT NULL DEFAULT 0,
    ADD COLUMN show_in_menu BOOLEAN      NOT NULL DEFAULT TRUE;
