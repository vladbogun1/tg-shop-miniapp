-- Payment receipts the bot already sent to the customer as a PDF in Telegram (ReceiptDeliveryJob):
-- one row per fiscal check (monobank check id) or, when the PRRO issued nothing, per bank receipt
-- ("bank:<payment_invoices.id>"). The primary key is what makes a receipt go out exactly once.
--   outcome: SENDING (claimed, being sent) | SENT | BLOCKED (the customer blocked the bot)
CREATE TABLE payment_receipts_sent (
    check_id   VARCHAR(80)  NOT NULL,
    invoice_id BINARY(16)   NOT NULL,
    order_id   BINARY(16)   NOT NULL,
    -- FISCAL_SALE | FISCAL_RETURN | BANK
    kind       VARCHAR(16)  NOT NULL,
    outcome    VARCHAR(16)  NOT NULL,
    sent_at    TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (check_id),
    KEY ix_payment_receipts_sent_invoice (invoice_id),
    CONSTRAINT fk_payment_receipts_sent_invoice FOREIGN KEY (invoice_id) REFERENCES payment_invoices (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
