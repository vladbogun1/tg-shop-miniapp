-- Orders are never deleted any more (25.10.2026: a 7 100 ₴ order and 48 others were deleted for
-- good, payment records went with them by cascade). Everything here is additive: the old backend
-- starts on this schema with a "future migration" warning, rollback = images only.

-- 1. Archive instead of delete: hidden from the board/lists, kept with everything attached.
ALTER TABLE orders
    ADD COLUMN archived_at    TIMESTAMP(6) NULL,
    ADD COLUMN archived_by    VARCHAR(255) NULL,
    ADD COLUMN archive_reason VARCHAR(500) NULL,
    -- the parcel was refused / sent back and is on its way to the shop: IN_TRANSIT, then RECEIVED.
    -- A partial return of a delivered order is IN_TRANSIT too: only its units travel (order_items.return_pending_qty)
    ADD COLUMN return_status  VARCHAR(16)  NULL,
    ADD COLUMN return_sent_at TIMESTAMP(6) NULL,
    ADD COLUMN return_received_at TIMESTAMP(6) NULL,
    ADD KEY ix_orders_archived (archived_at),
    ADD KEY ix_orders_return_status (return_status);

-- Units of a line on their way back to the shop: on arrival each goes back on the shelf or is written off.
ALTER TABLE order_items
    ADD COLUMN return_pending_qty INT NOT NULL DEFAULT 0;

-- 2. Payment records must outlive any mistake: an order row can no longer take its invoices
--    (and through them the fiscal receipts) with it.
ALTER TABLE payment_invoices DROP FOREIGN KEY fk_payment_invoices_order;
ALTER TABLE payment_invoices
    ADD CONSTRAINT fk_payment_invoices_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT;

-- 3. Money journal of an order: every amount that came in or went out, through which channel.
--    orders.received_minor / refunded_minor stay the running totals; every change to them writes a row here.
CREATE TABLE order_money_movements (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    order_id     BINARY(16)   NOT NULL,
    -- PAYMENT (in), REFUND (out), RETAINED (kept by the shop, e.g. prepayment covering delivery
    -- of a refused parcel — informational, does not change the totals), CORRECTION (signed fix of received)
    kind         VARCHAR(16)  NOT NULL,
    -- MONO, NP_COD, NP_PAYMENT_CONTROL, CARD_TRANSFER, CASH, NP_CLAIM, OTHER
    channel      VARCHAR(24)  NOT NULL,
    amount_minor BIGINT       NOT NULL,
    occurred_at  TIMESTAMP(6) NOT NULL,
    admin_name   VARCHAR(255) NULL,
    note         VARCHAR(500) NULL,
    -- monobank invoiceId for MONO rows
    invoice_ext_id VARCHAR(64) NULL,
    -- AUTO (system: delivery, bank), ADMIN, BACKFILL (rebuilt from the totals on 25.10.2026)
    source       VARCHAR(16)  NOT NULL,
    created_at   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY ix_money_order (order_id, occurred_at),
    KEY ix_money_kind_date (kind, occurred_at),
    CONSTRAINT fk_money_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 4. Stock that left the shelf without a sale: defects from returns, inventory, mis-sorts, offline sales.
CREATE TABLE stock_writeoffs (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    product_id   BINARY(16)   NOT NULL,
    variant_id   BINARY(16)   NULL,
    title        VARCHAR(255) NOT NULL,
    quantity     INT          NOT NULL,
    -- DEFECT, INVENTORY, MISSORT, SOLD_OFFLINE, OTHER
    reason       VARCHAR(16)  NOT NULL,
    note         VARCHAR(500) NULL,
    order_id     BINARY(16)   NULL,
    -- unit price the loss is counted at (order price for a return, current price otherwise)
    unit_value_minor BIGINT   NOT NULL DEFAULT 0,
    admin_name   VARCHAR(255) NULL,
    created_at   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY ix_writeoffs_date (created_at),
    KEY ix_writeoffs_product (product_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 5. Units an exchange took back, line by line (the order itself drops them).
CREATE TABLE order_exchange_lines (
    id               BIGINT       NOT NULL AUTO_INCREMENT,
    exchange_id      BIGINT       NOT NULL,
    product_id       BINARY(16)   NOT NULL,
    variant_id       BINARY(16)   NULL,
    title            VARCHAR(255) NOT NULL,
    quantity         INT          NOT NULL,
    unit_price_minor BIGINT       NOT NULL,
    -- RESTOCK | DEFECT
    outcome          VARCHAR(16)  NOT NULL,
    PRIMARY KEY (id),
    KEY ix_exchange_lines_exchange (exchange_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 6. «Инциденты» (SUPER_ADMIN only): notes on past cases. Filled on the server, not from the repo.
CREATE TABLE admin_incidents (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    code           VARCHAR(64)  NOT NULL,
    title          VARCHAR(255) NOT NULL,
    order_ref      VARCHAR(36)  NULL,
    severity       VARCHAR(8)   NOT NULL DEFAULT 'MEDIUM',
    -- OPEN | RESOLVED
    status         VARCHAR(16)  NOT NULL DEFAULT 'OPEN',
    facts          TEXT         NULL,
    hypothesis     TEXT         NULL,
    suggestion     TEXT         NULL,
    resolution     VARCHAR(1000) NULL,
    resolved_by    VARCHAR(255) NULL,
    resolved_at    TIMESTAMP(6) NULL,
    created_at     TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_incidents_code (code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 7. Backfill the journal from the totals, once. Online part: what monobank credited / gave back.
INSERT INTO order_money_movements (order_id, kind, channel, amount_minor, occurred_at, invoice_ext_id, source, note)
SELECT i.order_id, 'PAYMENT', 'MONO', i.amount_minor, i.applied_at, i.external_id, 'BACKFILL', 'monobank'
FROM payment_invoices i
WHERE i.applied_at IS NOT NULL;

INSERT INTO order_money_movements (order_id, kind, channel, amount_minor, occurred_at, invoice_ext_id, source, note)
SELECT i.order_id, 'REFUND', 'MONO', i.refunded_minor, COALESCE(o.returned_at, i.updated_at), i.external_id, 'BACKFILL', 'monobank'
FROM payment_invoices i
JOIN orders o ON o.id = i.order_id
WHERE i.refunded_minor > 0;

-- The rest of received: cash on delivery for delivered NP orders, otherwise «other» (manual marks).
INSERT INTO order_money_movements (order_id, kind, channel, amount_minor, occurred_at, source, note)
SELECT o.id, 'PAYMENT',
       CASE WHEN o.delivery_method = 'NOVA_POSHTA' AND o.prepayment_minor > 0 THEN 'NP_COD' ELSE 'OTHER' END,
       o.received_minor - COALESCE(m.mono, 0),
       COALESCE(o.delivered_at, o.paid_at, o.created_at), 'BACKFILL', 'по сумме «получено»'
FROM orders o
LEFT JOIN (SELECT order_id, SUM(amount_minor) AS mono FROM order_money_movements
           WHERE kind = 'PAYMENT' AND channel = 'MONO' GROUP BY order_id) m ON m.order_id = o.id
WHERE o.received_minor - COALESCE(m.mono, 0) > 0;

INSERT INTO order_money_movements (order_id, kind, channel, amount_minor, occurred_at, source, note)
SELECT o.id, 'REFUND', 'OTHER', o.refunded_minor - COALESCE(m.mono, 0),
       COALESCE(o.returned_at, o.rejected_at, o.updated_at), 'BACKFILL', 'по сумме «возвращено»'
FROM orders o
LEFT JOIN (SELECT order_id, SUM(amount_minor) AS mono FROM order_money_movements
           WHERE kind = 'REFUND' AND channel = 'MONO' GROUP BY order_id) m ON m.order_id = o.id
WHERE o.refunded_minor - COALESCE(m.mono, 0) > 0;

-- Reconcile: where monobank credited more than the order counts (received is capped at the total,
-- «снять оплату», exchanges), one CORRECTION makes the journal equal received − refunded, so the
-- «Инциденты» drift check starts from zero.
INSERT INTO order_money_movements (order_id, kind, channel, amount_minor, occurred_at, source, note)
SELECT o.id, 'CORRECTION', 'OTHER', (o.received_minor - o.refunded_minor) - j.net,
       COALESCE(o.updated_at, o.created_at), 'BACKFILL', 'сверка с суммами заказа'
FROM orders o
JOIN (SELECT order_id,
             SUM(CASE kind WHEN 'PAYMENT' THEN amount_minor WHEN 'CORRECTION' THEN amount_minor
                           WHEN 'REFUND' THEN -amount_minor ELSE 0 END) AS net
      FROM order_money_movements GROUP BY order_id) j ON j.order_id = o.id
WHERE j.net <> o.received_minor - o.refunded_minor;
