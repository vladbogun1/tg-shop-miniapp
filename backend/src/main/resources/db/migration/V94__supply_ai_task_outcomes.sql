-- Задачи ИИ поставки решаются в самой поставке, а не в «ИИ-задачи → Проверить» (08.11.2026, OwnScreen.java):
-- черновик при «Принять» ставит своим задачам «применено», при «Удалить» — «отклонено»; ручной путь — «применено»,
-- когда ответ взят в форму поставки. Здесь — решение для задач, которые закончились до этого и висят без него
-- (не удаляются: их деньги и токены остаются в журнале ИИ).
-- - черновик принят → APPLIED; черновика нет (удалён) → REJECTED; черновик ещё на проверке — решит он сам;
-- - накладная ручного пути: в течение суток создана поставка «Поставкой с ИИ» → APPLIED, иначе REJECTED
--   (preorder_batches.created_by — имя админа, не id, поэтому только по времени и пометке в заметке).
-- Только меняет данные в колонках, которые старый бэкенд уже знает: откат образами (infra/rollback.sh) без правки базы.
-- Вернуть как было (до V94 решения у этих задач не было):
--   UPDATE ai_jobs SET outcome = NULL, outcome_applied = NULL, outcome_rejected = NULL, outcome_edited = NULL,
--          outcome_ignored = NULL, outcome_at = NULL
--   WHERE subject_type IN ('SUPPLY_DRAFT', 'SUPPLY_FILES') AND outcome_at = <время выкатки V94>;
UPDATE ai_jobs j
    LEFT JOIN supply_drafts d ON d.id = CAST(SUBSTRING_INDEX(SUBSTRING(j.subject_id, 2), '-', 1) AS UNSIGNED)
SET j.outcome          = IF(d.id IS NULL, 'REJECTED', 'APPLIED'),
    j.outcome_applied  = IF(d.id IS NULL, 0, 1),
    j.outcome_rejected = IF(d.id IS NULL, 1, 0),
    j.outcome_edited   = 0,
    j.outcome_ignored  = 0,
    j.outcome_at       = NOW(6)
WHERE j.subject_type = 'SUPPLY_DRAFT'
  AND j.status IN ('DONE', 'EMPTY', 'BAD_ANSWER')
  AND j.outcome IS NULL
  AND (d.id IS NULL OR d.status = 'ACCEPTED');

-- MySQL присваивает слева направо: outcome_applied / outcome_rejected ниже читают уже новый outcome.
UPDATE ai_jobs j
SET j.outcome          = IF(EXISTS (SELECT 1 FROM preorder_batches b
                                    WHERE b.created_at BETWEEN j.finished_at AND j.finished_at + INTERVAL 1 DAY
                                      AND b.private_note LIKE '%Поставкой с ИИ%'), 'APPLIED', 'REJECTED'),
    j.outcome_applied  = IF(j.outcome = 'APPLIED', 1, 0),
    j.outcome_rejected = IF(j.outcome = 'APPLIED', 0, 1),
    j.outcome_edited   = 0,
    j.outcome_ignored  = 0,
    j.outcome_at       = NOW(6)
WHERE j.subject_type = 'SUPPLY_FILES'
  AND j.status IN ('DONE', 'EMPTY', 'BAD_ANSWER')
  AND j.outcome IS NULL;
