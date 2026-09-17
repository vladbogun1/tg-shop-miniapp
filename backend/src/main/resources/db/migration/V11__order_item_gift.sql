-- Mark an order item as a free gift added by an admin (price 0, but stock is still
-- decremented so the gifted unit can't be sold to someone else).
ALTER TABLE order_items ADD COLUMN gift BOOLEAN NOT NULL DEFAULT FALSE;
