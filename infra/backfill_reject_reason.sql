-- Backfill reject_reason for migrated REJECTED orders from the chat service card
-- (format: "❌ Причина: <reason>\n..."). Takes the latest matching message per order.
UPDATE orders o
SET o.reject_reason = (
    SELECT TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(m.text, 'Причина: ', -1), '\n', 1))
    FROM order_messages m
    WHERE m.order_id = o.id
      AND m.sender_type = 'SYSTEM'
      AND m.text LIKE '%Причина: %'
    ORDER BY m.created_at DESC
    LIMIT 1)
WHERE o.status = 'REJECTED'
  AND (o.reject_reason IS NULL OR o.reject_reason = '');

SELECT
  SUM(status='REJECTED') AS rejected,
  SUM(status='REJECTED' AND reject_reason IS NOT NULL AND reject_reason<>'') AS with_reason
FROM orders;
