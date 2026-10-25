-- Merging two orders of one customer that have not shipped yet (2026-10-26). The lines of the
-- merged order are copied into the one that stays; the merged order is closed (REJECTED, code
-- MERGED) and points at it, keeping its own lines and history. Money already received moves through
-- the money journal (channel MERGE). Additive only: rollback = older images.
ALTER TABLE orders
    ADD COLUMN merged_into_order_id BINARY(16) NULL,
    ADD KEY ix_orders_merged_into (merged_into_order_id);
