-- Snapshot the prepayment amount onto the order at creation, so the seller's
-- dispatch list can compute the cash-on-delivery (наложка) amount accurately
-- even if the payment option is later edited/removed.
-- 0 for full-payment options; the option's prepayment_minor for prepay options.
ALTER TABLE orders
    ADD COLUMN prepayment_minor BIGINT NOT NULL DEFAULT 0;
