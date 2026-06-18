-- Backfill order status-transition timestamps from the migrated chat service messages.
-- The old bot logged SYSTEM cards whose <b>header</b> was the new status; the message
-- created_at ≈ the transition time. We take the earliest matching message per order.
-- Only fills NULLs (new orders keep their real timestamps).

UPDATE orders o
SET o.approved_at = (
    SELECT MIN(m.created_at) FROM order_messages m
    WHERE m.order_id = o.id AND m.sender_type = 'SYSTEM' AND m.text LIKE '%ОДОБРЕНО%')
WHERE o.approved_at IS NULL;

UPDATE orders o
SET o.shipped_at = (
    SELECT MIN(m.created_at) FROM order_messages m
    WHERE m.order_id = o.id AND m.sender_type = 'SYSTEM' AND m.text LIKE '%ВЫСЛАНО%')
WHERE o.shipped_at IS NULL;

UPDATE orders o
SET o.delivered_at = (
    SELECT MIN(m.created_at) FROM order_messages m
    WHERE m.order_id = o.id AND m.sender_type = 'SYSTEM' AND m.text LIKE '%ДОСТАВЛЕНО%')
WHERE o.delivered_at IS NULL;

UPDATE orders o
SET o.rejected_at = (
    SELECT MIN(m.created_at) FROM order_messages m
    WHERE m.order_id = o.id AND m.sender_type = 'SYSTEM' AND m.text LIKE '%ОТКЛОНЕНО%')
WHERE o.rejected_at IS NULL;

-- Sanity: keep chronology monotonic where both exist (don't let backfill create negative spans).
UPDATE orders SET shipped_at   = NULL WHERE shipped_at   IS NOT NULL AND approved_at IS NOT NULL AND shipped_at   < approved_at;
UPDATE orders SET delivered_at = NULL WHERE delivered_at IS NOT NULL AND shipped_at   IS NOT NULL AND delivered_at < shipped_at;

SELECT
  SUM(approved_at  IS NOT NULL) AS approved,
  SUM(shipped_at   IS NOT NULL) AS shipped,
  SUM(delivered_at IS NOT NULL) AS delivered,
  SUM(rejected_at  IS NOT NULL) AS rejected
FROM orders;
