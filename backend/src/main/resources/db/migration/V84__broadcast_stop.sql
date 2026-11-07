-- «Остановить» у идущей рассылки: флаг в БД (его видит и другой экземпляр бэкенда), кто и когда нажал.
-- Статус STOPPED — это значение уже существующей колонки status VARCHAR(16), схема статуса не меняется.
-- Только добавление колонок с NULL: старый бэкенд на этой схеме работает (колонки не читает).
ALTER TABLE broadcasts
    ADD COLUMN stop_requested_at DATETIME(6) NULL,
    ADD COLUMN stopped_by_id     BIGINT      NULL,
    ADD COLUMN stopped_by_name   VARCHAR(255) NULL;
