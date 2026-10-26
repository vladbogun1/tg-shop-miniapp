-- Partial pickup at Nova Poshta (2026-10-26): the customer takes part of the parcel and refuses the
-- rest, which travels back. The paid value of the refused units is never collected: «Доставлен»
-- records the total minus this as received, наложка and the metrics leave it out. Additive only:
-- rollback = older images (they ignore the column and book the whole total at delivery).
ALTER TABLE orders
    ADD COLUMN uncollected_minor BIGINT NOT NULL DEFAULT 0;
