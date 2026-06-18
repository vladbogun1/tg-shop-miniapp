-- ============================================================
--  Временные метки переходов статуса заказа — для метрик
--  скорости обработки/доставки. Заполняются на новых заказах
--  (миграционные исторические заказы их не имеют → NULL).
-- ============================================================

ALTER TABLE orders
    ADD COLUMN approved_at  TIMESTAMP NULL AFTER status,
    ADD COLUMN shipped_at   TIMESTAMP NULL AFTER approved_at,
    ADD COLUMN delivered_at TIMESTAMP NULL AFTER shipped_at,
    ADD COLUMN rejected_at  TIMESTAMP NULL AFTER delivered_at;
