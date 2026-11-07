-- Встроенный ИИ, доводка карточки (07.11.2026).
-- 1) ai_jobs.step / step_at — что задача делает сейчас («Ищу: …», «Читаю страницу …», «Пишу ответ»). Шаг в базе, а не
--    в памяти: во время выкатки живут два экземпляра бэкенда, и экран может спросить не тот, что ведёт задачу.
--    Пишется не чаще раза в секунду (AiJobSteps), только пока задача RUNNING.
-- 2) ai_job_bodies.subject_snapshot — поля объекта на момент старта (JSON {"spec:dpi":"26000",...}, тот же вид, что у
--    SubjectFields.snapshot). По нему сервер решает, что изменили, пока работал ИИ, на любом устройстве (раньше снимок
--    лежал в localStorage браузера, запустившего задачу). Чистится вместе с промптом через 60 дней.
-- Только добавляет nullable-колонки: старый бэкенд их не читает, откат — образами (rollback.sh). Убрать при желании:
--   ALTER TABLE ai_jobs DROP COLUMN step, DROP COLUMN step_at;
--   ALTER TABLE ai_job_bodies DROP COLUMN subject_snapshot;
ALTER TABLE ai_jobs
    ADD COLUMN step    VARCHAR(160) NULL,
    ADD COLUMN step_at TIMESTAMP(6) NULL;

ALTER TABLE ai_job_bodies
    ADD COLUMN subject_snapshot MEDIUMTEXT NULL;
