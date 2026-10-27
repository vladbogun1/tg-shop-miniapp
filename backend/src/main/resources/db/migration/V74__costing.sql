-- Money for batches (docs/PREORDERS-PLAN.md §5А, 2026-10-27): batch expenses and how they are spread over
-- the units, stock lots for FIFO cost of goods sold, which lot each sold/gifted unit came from, and the
-- «Финансы» right for admins other than the main one. Cost per unit is never stored: it is computed from
-- the purchase price, the rate and the expenses, so an expense entered after the sales re-prices them.
-- Additive only: rollback = older images (they do not touch the new tables; the ledger simply stops).

ALTER TABLE preorder_batches
    -- BY_VALUE | BY_QTY | BY_WEIGHT | MANUAL
    ADD COLUMN cost_allocation VARCHAR(10) NOT NULL DEFAULT 'BY_VALUE',
    -- «Все расходы внесены»: until then the cost is shown as preliminary
    ADD COLUMN costs_final     TINYINT(1)  NOT NULL DEFAULT 0;

ALTER TABLE preorder_batch_items
    ADD COLUMN weight_g           INT    NULL,
    -- MANUAL allocation: the line's share of the batch expenses, UAH kopecks for the whole line
    ADD COLUMN manual_extra_minor BIGINT NULL;

CREATE TABLE batch_expenses (
    id            BIGINT        NOT NULL AUTO_INCREMENT,
    batch_id      BIGINT        NOT NULL,
    -- NULL = the whole batch, else only this line (e.g. duty on the mouse pads)
    batch_item_id BIGINT        NULL,
    -- FREIGHT | CUSTOMS | BROKER | DOMESTIC | BANK | OTHER (a negative amount = compensation)
    kind          VARCHAR(10)   NOT NULL,
    amount_minor  BIGINT        NOT NULL,
    currency      VARCHAR(3)    NOT NULL DEFAULT 'UAH',
    -- UAH per 1 unit of the currency; NULL for UAH
    fx_rate       DECIMAL(12,4) NULL,
    spent_on      DATE          NULL,
    note          VARCHAR(500)  NULL,
    created_by    VARCHAR(255)  NULL,
    created_at    TIMESTAMP(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY ix_batch_expenses_batch (batch_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Documents of an expense (invoice, customs declaration, bank statement): photos or PDFs in the private
-- costing/ prefix of the bucket (imgproxy serves only products/), handed out by the admin API to «Финансы».
CREATE TABLE batch_expense_files (
    id            BIGINT        NOT NULL AUTO_INCREMENT,
    expense_id    BIGINT        NOT NULL,
    object_key    VARCHAR(500)  NOT NULL,
    file_name     VARCHAR(255)  NOT NULL,
    content_type  VARCHAR(100)  NULL,
    size_bytes    BIGINT        NOT NULL DEFAULT 0,
    created_by    VARCHAR(255)  NULL,
    created_at    TIMESTAMP(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY ix_batch_expense_files_expense (expense_id),
    CONSTRAINT fk_batch_expense_files_expense FOREIGN KEY (expense_id) REFERENCES batch_expenses (id)
        ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Lots of stock, for money only (products.stock stays the one number the shop sells from). Units leave
-- the oldest lot first (FIFO). OPENING = stock that was on the shelf before the ledger (cost unknown
-- unless the admin types it later), BATCH = an arrival, MANUAL = the admin raised the stock by hand.
CREATE TABLE stock_lots (
    id                      BIGINT       NOT NULL AUTO_INCREMENT,
    product_id              BINARY(16)   NOT NULL,
    variant_id              BINARY(16)   NULL,
    kind                    VARCHAR(8)   NOT NULL,
    batch_item_id           BIGINT       NULL,
    qty_in                  INT          NOT NULL,
    qty_left                INT          NOT NULL,
    -- OPENING / MANUAL: the cost the admin typed («Начальная себестоимость»), UAH kopecks per unit
    unit_cost_minor         BIGINT       NULL,
    created_at              TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY ix_stock_lots_key (product_id, variant_id, qty_left),
    KEY ix_stock_lots_batch_item (batch_item_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Which lot the units of an order line came from. Units put back on the shelf leave this table (back to
-- their lot); units returned without restock stay here — their cost is the shop's loss.
CREATE TABLE order_item_lots (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    order_item_id BIGINT       NOT NULL,
    lot_id        BIGINT       NOT NULL,
    qty           INT          NOT NULL,
    created_at    TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY ix_order_item_lots_item (order_item_id),
    KEY ix_order_item_lots_lot (lot_id),
    CONSTRAINT fk_order_item_lots_item FOREIGN KEY (order_item_id) REFERENCES order_items (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- «Финансы»: purchase prices, expenses and margin for an admin who is not the main one.
ALTER TABLE admin_users
    ADD COLUMN finance TINYINT(1) NOT NULL DEFAULT 0;

-- Everything on the shelf now becomes the opening lot, cost unknown (owner's decision: old stock is not
-- priced; it leaves first by FIFO and those sales show as «нет данных»).
INSERT INTO stock_lots (product_id, variant_id, kind, qty_in, qty_left)
SELECT v.product_id, v.id, 'OPENING', v.stock, v.stock
FROM product_variants v
WHERE v.stock > 0;

INSERT INTO stock_lots (product_id, variant_id, kind, qty_in, qty_left)
SELECT p.id, NULL, 'OPENING', p.stock, p.stock
FROM products p
WHERE p.stock > 0
  AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id);
