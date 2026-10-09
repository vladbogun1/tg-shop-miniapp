-- ============================================================
--  Логотипы брендов для бегущей строки на главной сайта.
--  logo_url  — ключ объекта в MinIO (products/brands/…, рендер через imgproxy) или внешний URL;
--              NULL — логотипа нет, сайт пишет название бренда шрифтом.
--  logo_mode — MONO: перекрашивать в один цвет под тему сайта; ORIGINAL: показывать как есть.
-- ============================================================

ALTER TABLE brands
    ADD COLUMN logo_url  VARCHAR(2048) NULL,
    ADD COLUMN logo_mode VARCHAR(16)   NOT NULL DEFAULT 'MONO';
