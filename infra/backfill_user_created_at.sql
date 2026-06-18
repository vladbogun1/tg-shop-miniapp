-- Backfill users.created_at from the earliest real signal (order or chat message).
-- The migration tool created every users row with created_at = now (DB default),
-- collapsing the "new users by day" chart into a single spike. This sets created_at
-- to the earliest order/message date for users who have any — only moving it BACKWARD
-- (idempotent; users with no orders/messages keep their current date).
UPDATE users u
JOIN (
    SELECT uid, MIN(ts) AS earliest FROM (
        SELECT o.user_id AS uid, o.created_at AS ts
        FROM orders o WHERE o.user_id IS NOT NULL
        UNION ALL
        SELECT o.user_id AS uid, m.created_at AS ts
        FROM order_messages m JOIN orders o ON m.order_id = o.id
        WHERE o.user_id IS NOT NULL
    ) x GROUP BY uid
) e ON e.uid = u.telegram_user_id
SET u.created_at = e.earliest
WHERE e.earliest < u.created_at;
