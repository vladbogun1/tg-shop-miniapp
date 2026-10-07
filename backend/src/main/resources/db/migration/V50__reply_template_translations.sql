-- ============================================================
--  Шаблоны ответов в чате (⚡) переходят на общие переводы контента.
--  Русский текст (reply_templates.body_ru) — источник, украинский и английский —
--  строки content_translations с entity_type = 'REPLY_TEMPLATE', field = 'body'.
--  Так они попадают во вкладку «Переводы» (выгрузка на перевод, «устарел» после
--  правки русского текста), как товары и категории.
--
--  entity_id — 16 байт, а у шаблона числовой id: он лежит в младших 8 байтах
--  (id 10 → 00000000-0000-0000-0000-00000000000a), см. ReplyTemplate.translationId().
--
--  Уже заполненные body_uk / body_en переносятся как переводы текущего русского
--  текста (source_hash = SHA-256 body_ru — не «устаревшие»), origin = AI: это
--  заготовки, а не ручная правка админа, их можно перезаписать импортом.
--  Сами колонки body_uk / body_en остаются (код их больше не читает), чтобы откат
--  на релиз до V50 нашёл тексты на месте.
-- ============================================================

ALTER TABLE content_translations
    MODIFY entity_type ENUM('PRODUCT','VARIANT','TAG','PAYMENT_OPTION','REPLY_TEMPLATE') NOT NULL;

INSERT INTO content_translations (entity_type, entity_id, field, locale, text, source_hash, origin)
SELECT 'REPLY_TEMPLATE', UNHEX(LPAD(HEX(t.id), 32, '0')), 'body', 'uk', TRIM(t.body_uk), SHA2(t.body_ru, 256), 'AI'
  FROM reply_templates t
 WHERE t.body_uk IS NOT NULL AND TRIM(t.body_uk) <> ''
ON DUPLICATE KEY UPDATE text = VALUES(text), source_hash = VALUES(source_hash);

INSERT INTO content_translations (entity_type, entity_id, field, locale, text, source_hash, origin)
SELECT 'REPLY_TEMPLATE', UNHEX(LPAD(HEX(t.id), 32, '0')), 'body', 'en', TRIM(t.body_en), SHA2(t.body_ru, 256), 'AI'
  FROM reply_templates t
 WHERE t.body_en IS NOT NULL AND TRIM(t.body_en) <> ''
ON DUPLICATE KEY UPDATE text = VALUES(text), source_hash = VALUES(source_hash);
