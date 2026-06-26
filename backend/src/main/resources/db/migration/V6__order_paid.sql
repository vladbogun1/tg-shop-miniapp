-- Payment confirmation: an order has two states — paid / not paid.
-- The customer uploads a transfer screenshot (P2P proof, posted into the order
-- chat); uploading it flips the order to paid. Defaults to NOT paid.
ALTER TABLE orders
    ADD COLUMN paid BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN paid_at TIMESTAMP NULL;
