-- Pre-orders («Скоро в наявності», docs/PREORDERS-PLAN.md, 2026-10-27). A «поставка» (batch) is what the
-- shop ordered from a factory: lines with the quantity and the purchase price, an ETA the admin types
-- however precise he knows it, and a status for the admin. Customers queue for any product/variant that is
-- out of stock (with or without a batch); when goods arrive the queue gets holds in order of joining, a
-- hold that runs out passes to the next person. Purchase prices are here already; batch expenses and the
-- cost ledger come with the money stage. Additive only: rollback = older images.
CREATE TABLE suppliers (
    id         BIGINT       NOT NULL AUTO_INCREMENT,
    name       VARCHAR(255) NOT NULL,
    note       VARCHAR(1000) NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE preorder_batches (
    id             BIGINT        NOT NULL AUTO_INCREMENT,
    title          VARCHAR(255)  NOT NULL,
    supplier_id    BIGINT        NULL,
    private_note   TEXT          NULL,
    -- shown to customers on the product page (translated as content, entity_type PREORDER_BATCH)
    public_note    VARCHAR(1000) NULL,
    -- ORDERED | IN_TRANSIT | CUSTOMS | ARRIVED | CANCELLED
    status         VARCHAR(16)   NOT NULL DEFAULT 'ORDERED',
    -- customers may queue for the lines (off = a plain purchase for the cost ledger)
    preorder_open  TINYINT(1)    NOT NULL DEFAULT 1,
    -- DATE (eta_from) | RANGE (eta_from..eta_to) | APPROX (eta_to = target, shown as «~N weeks») | HIDDEN
    eta_mode       VARCHAR(8)    NOT NULL DEFAULT 'HIDDEN',
    eta_from       DATE          NULL,
    eta_to         DATE          NULL,
    hold_hours     INT           NOT NULL DEFAULT 24,
    -- QUEUE_HOLD | ALL_AT_ONCE
    distribution   VARCHAR(12)   NOT NULL DEFAULT 'QUEUE_HOLD',
    -- purchase currency and the rate paid (UAH per 1 unit)
    currency       VARCHAR(3)    NOT NULL DEFAULT 'USD',
    fx_rate        DECIMAL(12,4) NULL,
    created_by     VARCHAR(255)  NULL,
    created_at     TIMESTAMP(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at     TIMESTAMP(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    in_transit_at  TIMESTAMP(6)  NULL,
    arrived_at     TIMESTAMP(6)  NULL,
    cancelled_at   TIMESTAMP(6)  NULL,
    PRIMARY KEY (id),
    KEY ix_preorder_batches_status (status)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE preorder_batch_items (
    id            BIGINT     NOT NULL AUTO_INCREMENT,
    batch_id      BIGINT     NOT NULL,
    product_id    BINARY(16) NOT NULL,
    variant_id    BINARY(16) NULL,
    qty_ordered   INT        NOT NULL,
    -- filled on «Приехала»
    qty_arrived   INT        NULL,
    -- purchase price per unit in minor units of the batch currency (cents)
    unit_price_fx BIGINT     NULL,
    PRIMARY KEY (id),
    KEY ix_batch_items_batch (batch_id),
    KEY ix_batch_items_product (product_id, variant_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE preorder_subscriptions (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    -- users.telegram_user_id
    user_id      BIGINT       NOT NULL,
    product_id   BINARY(16)   NOT NULL,
    variant_id   BINARY(16)   NULL,
    qty          INT          NOT NULL DEFAULT 1,
    -- WAITING | HELD | NOTIFIED | BOUGHT | EXPIRED | CANCELLED
    status       VARCHAR(12)  NOT NULL DEFAULT 'WAITING',
    -- the batch whose arrival gave the hold / the notice
    batch_id     BIGINT       NULL,
    held_qty     INT          NOT NULL DEFAULT 0,
    hold_until   TIMESTAMP(6) NULL,
    reminded_at  TIMESTAMP(6) NULL,
    -- MINIAPP | WEB
    source       VARCHAR(16)  NULL,
    order_id     BINARY(16)   NULL,
    created_at   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    notified_at  TIMESTAMP(6) NULL,
    closed_at    TIMESTAMP(6) NULL,
    close_reason VARCHAR(255) NULL,
    -- one live place in a queue per person and product/variant (closed rows keep the history)
    active_key   VARCHAR(80)  AS (CASE WHEN status IN ('WAITING', 'HELD', 'NOTIFIED')
                                       THEN CONCAT(user_id, ':', HEX(product_id), ':', COALESCE(HEX(variant_id), ''))
                                  END) STORED,
    PRIMARY KEY (id),
    UNIQUE KEY ux_preorder_subs_active (active_key),
    KEY ix_preorder_subs_queue (product_id, variant_id, status, created_at),
    KEY ix_preorder_subs_user (user_id, status),
    KEY ix_preorder_subs_hold (status, hold_until)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
