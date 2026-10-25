-- Returns and exchanges as records that can be cancelled (2026-10-25). Until now a return only
-- moved counters on the order lines, so «передумали» could not be undone. Each wizard run (and each
-- exchange) now leaves one record with its lines; cancelling it puts the units back into the order,
-- takes restocked units off the shelf again, reverses the write-off and books the money back (or a
-- debt of the customer). Write-offs get an «undone» part: cancelled with a return, or the broken unit
-- turned out fine and went back on the shelf. Additive only: rollback = older images.
CREATE TABLE order_returns (
    id                BIGINT       NOT NULL AUTO_INCREMENT,
    order_id          BINARY(16)   NOT NULL,
    -- RETURN | EXCHANGE
    kind              VARCHAR(16)  NOT NULL DEFAULT 'RETURN',
    exchange_id       BIGINT       NULL,
    -- money given back by hand (one channel per wizard run) and through monobank
    refund_minor      BIGINT       NOT NULL DEFAULT 0,
    refund_channel    VARCHAR(24)  NULL,
    mono_refund_minor BIGINT       NOT NULL DEFAULT 0,
    note              VARCHAR(500) NULL,
    admin_name        VARCHAR(255) NULL,
    created_at        TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    cancelled_at      TIMESTAMP(6) NULL,
    cancelled_by      VARCHAR(255) NULL,
    cancel_note       VARCHAR(500) NULL,
    -- cancelled while the refund stayed with the customer: what they owe, and when it came back
    debt_minor        BIGINT       NOT NULL DEFAULT 0,
    debt_paid_at      TIMESTAMP(6) NULL,
    PRIMARY KEY (id),
    KEY ix_order_returns_order (order_id, id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE order_return_lines (
    id            BIGINT      NOT NULL AUTO_INCREMENT,
    return_id     BIGINT      NOT NULL,
    item_id       BIGINT      NOT NULL,
    quantity      INT         NOT NULL,
    -- RESTOCK | DEFECT | KEPT | IN_TRANSIT
    outcome       VARCHAR(16) NOT NULL,
    -- of them: put on the shelf / written off (IN_TRANSIT units fill these on «Посылка вернулась»)
    restocked_qty INT         NOT NULL DEFAULT 0,
    defect_qty    INT         NOT NULL DEFAULT 0,
    writeoff_id   BIGINT      NULL,
    PRIMARY KEY (id),
    KEY ix_return_lines_return (return_id),
    KEY ix_return_lines_item (item_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

ALTER TABLE stock_writeoffs
    ADD COLUMN undone_qty  INT          NOT NULL DEFAULT 0,
    ADD COLUMN undone_at   TIMESTAMP(6) NULL,
    ADD COLUMN undone_by   VARCHAR(255) NULL,
    ADD COLUMN undone_note VARCHAR(500) NULL;

ALTER TABLE order_exchanges
    ADD COLUMN cancelled_at TIMESTAMP(6) NULL,
    ADD COLUMN cancelled_by VARCHAR(255) NULL;
