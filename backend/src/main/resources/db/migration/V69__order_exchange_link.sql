-- Exchange as a linked replacement order (2026-10-25). The delivered order keeps its status, ТТН,
-- receipt and money; the units coming back go through «Едет назад» like any return, and the goods
-- sent instead form a new order that points at the original one. The paid value of the returned
-- units moves between the two through the money journal (channel EXCHANGE), so revenue is not
-- counted twice. Additive only: rollback = older images.
ALTER TABLE orders
    ADD COLUMN exchange_of_order_id BINARY(16) NULL,
    ADD KEY ix_orders_exchange_of (exchange_of_order_id);

ALTER TABLE order_exchanges
    ADD COLUMN new_order_id BINARY(16) NULL;
