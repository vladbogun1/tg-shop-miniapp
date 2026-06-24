-- Delivered orders have been paid for (COD collected on delivery, or prepaid).
-- It makes no sense to have a delivered-but-unpaid order, so backfill paid=true
-- for all existing DELIVERED orders (paid_at = delivery time when known).
UPDATE orders
SET paid = TRUE,
    paid_at = COALESCE(paid_at, delivered_at, updated_at, CURRENT_TIMESTAMP)
WHERE status = 'DELIVERED' AND paid = FALSE;
