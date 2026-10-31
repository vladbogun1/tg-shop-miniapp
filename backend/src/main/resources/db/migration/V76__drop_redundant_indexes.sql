-- Откат (только вернуть индексы; старый бэкенд работает и без миграции — индексы не влияют на JPA validate):
--   ALTER TABLE orders ADD INDEX idx_orders_status (status), ADD INDEX idx_orders_user (user_id);
--   ALTER TABLE client_events ADD INDEX idx_client_events_session (session_id, id);
--
-- Чистка дублей (аудит БД 2026-11, раздел «в»):
--  * idx_orders_status — префикс idx_orders_status_created (status, created_at);
--  * idx_orders_user   — префикс idx_orders_user_created (user_id, created_at); он же покрывает FK fk_orders_user;
--  * idx_client_events_session — session_id нигде не фильтруется и не джойнится (только CONCAT в
--    OnlineQueries и SELECT в AnalyticsQueries.loadRaw), индекс только тормозит вставку событий.
ALTER TABLE orders DROP INDEX idx_orders_status, DROP INDEX idx_orders_user;
ALTER TABLE client_events DROP INDEX idx_client_events_session;
