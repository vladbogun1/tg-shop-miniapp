-- ============================================================
--  Переводы: снимок оригинала и отметка «проверено человеком» (docs/TRANSLATIONS-UX-AUDIT.md).
--
--  source_text — русский текст, из которого сделан перевод (до V56 хранился только его хеш):
--    у устаревшего перевода экран показывает, что именно поменялось в оригинале. У текущих
--    переводов заполняется при старте бэкенда (TranslationAdminService.backfillSourceTexts),
--    у уже устаревших прежний текст не восстановить — остаётся NULL.
--  reviewed_at — перевод просмотрен и принят человеком; переводы ИИ без отметки попадают во
--    вкладку «Проверить ИИ». Всё, что уже есть до V56 (ручные и ИИ), считается проверенным:
--    эти тексты давно на витрине, и ~450 строк в очереди были бы шумом. В очередь попадают только
--    переводы ИИ, импортированные после релиза.
-- ============================================================

ALTER TABLE content_translations
    ADD COLUMN source_text TEXT NULL AFTER source_hash,
    ADD COLUMN reviewed_at TIMESTAMP NULL AFTER origin;

-- updated_at = updated_at: иначе ON UPDATE CURRENT_TIMESTAMP проставит всем строкам «сейчас».
UPDATE content_translations
   SET reviewed_at = updated_at, updated_at = updated_at
 WHERE reviewed_at IS NULL;
