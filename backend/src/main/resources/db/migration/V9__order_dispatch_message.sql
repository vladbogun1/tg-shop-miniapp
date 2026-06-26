-- Track the seller dispatch ("К ОТПРАВКЕ") card per order so it can be removed
-- when the order leaves APPROVED (shipped/delivered/cancelled) and so the
-- "ОТПРАВИТЬ В TELEGRAM" sync stays idempotent (one card per approved order).
ALTER TABLE orders ADD COLUMN dispatch_message_id INT NULL;
