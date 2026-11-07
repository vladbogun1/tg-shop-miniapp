-- Встроенный ИИ, доводка карточки (07.11.2026).
-- 1) ai_jobs.step / step_at — что задача делает сейчас («Ищу: …», «Читаю страницу …», «Пишу ответ»). Шаг в базе, а не
--    в памяти: во время выкатки живут два экземпляра бэкенда, и экран может спросить не тот, что ведёт задачу.
--    Пишется не чаще раза в секунду (AiJobSteps), только пока задача RUNNING.
-- 2) ai_job_bodies.subject_snapshot — поля объекта на момент старта (JSON {"spec:dpi":"26000",...}, тот же вид, что у
--    SubjectFields.snapshot). По нему сервер решает, что изменили, пока работал ИИ, на любом устройстве (раньше снимок
--    лежал в localStorage браузера, запустившего задачу). Чистится вместе с промптом через 60 дней.
-- 3) Ручной путь через ChatGPT как задача (доводка 3):
--    ai_jobs.pasted — задача MANUAL со вставленным ответом ChatGPT: ответ и промпт в ai_job_bodies, без модели и денег,
--    сразу DONE и ждёт той же проверки, что результат ИИ (outcome — после «Принять/Отклонить»). У прежних отметок
--    ручного пути (переводы, поставки: MANUAL, outcome APPLIED, без тела) — 0.
--    ai_batches.path — BUILTIN / MANUAL; у ручного пакета subjects — товары и их снимок на старте (JSON, пишет сервер),
--    draft — черновик экрана (текущая часть, вставленные ответы; JSON, пишет экран): продолжить можно с любого устройства.
-- Только добавляет колонки с умолчанием или nullable: старый бэкенд их не читает (ручные задачи у него видны в метриках
-- как прежние отметки), откат — образами (rollback.sh). Убрать при желании:
--   ALTER TABLE ai_jobs DROP COLUMN step, DROP COLUMN step_at, DROP COLUMN pasted;
--   ALTER TABLE ai_job_bodies DROP COLUMN subject_snapshot;
--   ALTER TABLE ai_batches DROP COLUMN path, DROP COLUMN subjects, DROP COLUMN draft;
ALTER TABLE ai_jobs
    ADD COLUMN step    VARCHAR(160) NULL,
    ADD COLUMN step_at TIMESTAMP(6) NULL;

ALTER TABLE ai_job_bodies
    ADD COLUMN subject_snapshot MEDIUMTEXT NULL;

ALTER TABLE ai_jobs
    ADD COLUMN pasted TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE ai_batches
    ADD COLUMN path     VARCHAR(12) NOT NULL DEFAULT 'BUILTIN',
    ADD COLUMN subjects MEDIUMTEXT  NULL,
    ADD COLUMN draft    MEDIUMTEXT  NULL;
