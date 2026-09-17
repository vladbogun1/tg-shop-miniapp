-- ============================================================
--  Индексы под фактические запросы админки и метрик.
--  (Все три места до этого читались полным сканом.)
-- ============================================================

-- Список пользователей считает по каждой строке два коррелированных подзапроса
-- по orders.tg_user_id, плюс по нему же строятся аудитории рассылок и метрика
-- «активные покупатели». Индекса не было вообще.
CREATE INDEX idx_orders_tg_user ON orders (tg_user_id);

-- Канбан-доска: пять запросов «status = ? ORDER BY created_at DESC» + счётчики.
-- Одиночный idx_orders_status не покрывал сортировку.
CREATE INDEX idx_orders_status_created ON orders (status, created_at);

-- Счётчики непрочитанных (колокольчик админа, карточки заказов, инбокс):
-- WHERE sender_type = ? AND read_at IS NULL.
CREATE INDEX idx_order_messages_unread ON order_messages (sender_type, read_at);
