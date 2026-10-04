-- ============================================================
--  Причины отказа справочником и возвраты.
--  * reject_reason_code — код причины (агрегируется в метриках);
--    текст reject_reason остаётся как пояснение. NULL = «не указано»
--    (все исторические заказы, кроме отмен покупателем — их видно по тексту).
--    Значения: NO_RESPONSE, CHANGED_MIND, OUT_OF_STOCK, DUPLICATE, NOT_PAID,
--    REFUSED_AT_POST, RETURNED, OTHER.
--  * refunded_minor / returned_at — сколько денег вернули клиенту и когда
--    оформлен последний возврат. Метрики вычитают refunded из «Получено».
--  * order_items.returned_qty — сколько единиц позиции вернул клиент;
--    restocked_qty — сколько единиц позиции уже положено обратно на склад, чтобы
--    последующее «Отклонить + вернуть на склад» не вернуло их второй раз.
-- ============================================================

ALTER TABLE orders
    ADD COLUMN reject_reason_code VARCHAR(32) NULL AFTER reject_reason,
    ADD COLUMN refunded_minor     BIGINT      NOT NULL DEFAULT 0 AFTER received_minor,
    ADD COLUMN returned_at        TIMESTAMP   NULL AFTER rejected_at;

ALTER TABLE order_items
    ADD COLUMN returned_qty  INT NOT NULL DEFAULT 0,
    ADD COLUMN restocked_qty INT NOT NULL DEFAULT 0;

-- Customer cancellations are recognisable by the text the backend has always written.
UPDATE orders
   SET reject_reason_code = 'CHANGED_MIND'
 WHERE status = 'REJECTED'
   AND reject_reason_code IS NULL
   AND reject_reason LIKE 'Отменён покупателем%';

-- REJECTED orders are settled: their stock was returned (or deliberately not) at rejection time.
-- Mark every unit as handled so a later return can never put the same units back a second time.
UPDATE order_items it
  JOIN orders o ON o.id = it.order_id
   SET it.restocked_qty = it.quantity
 WHERE o.status = 'REJECTED';
