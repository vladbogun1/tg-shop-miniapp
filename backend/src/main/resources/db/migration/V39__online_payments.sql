-- ============================================================
--  Online payment via monobank acquiring (plata by mono). Replaces the manual
--  "transfer to the card + screenshot" flow; see docs/MONOBANK-ACQUIRING.md.
--
--  * orders.payment_due_at — deadline to pay online (created_at + 24 h). An order
--    still unpaid past it is rejected automatically (PAYMENT_TIMEOUT) and restocked.
--    NULL = placed before online payments existed: never auto-cancelled.
--  * payment_invoices — one row per monobank invoice; an order may have several
--    (a failed / expired invoice is replaced by a fresh one).
--  * payment_webhook_log — raw webhooks, for debugging and disputes.
--
--  The legacy columns (orders.payment_claimed*, payment_requisites) stay in place
--  for now so a rollback to v3.x keeps working; the code no longer uses them.
-- ============================================================

ALTER TABLE orders
    ADD COLUMN payment_due_at TIMESTAMP NULL AFTER paid_at;

CREATE TABLE payment_invoices (
    id                   BINARY(16)   NOT NULL,
    order_id             BINARY(16)   NOT NULL,
    provider             VARCHAR(16)  NOT NULL,
    -- monobank invoiceId
    external_id          VARCHAR(64)  NOT NULL,
    amount_minor         BIGINT       NOT NULL,
    -- amount left after refunds (monobank finalAmount); NULL until known
    final_amount_minor   BIGINT       NULL,
    -- refunds already booked into orders.refunded_minor from this invoice
    refunded_minor       BIGINT       NOT NULL DEFAULT 0,
    ccy                  INT          NOT NULL DEFAULT 980,
    -- created | processing | hold | success | failure | reversed | expired
    status               VARCHAR(16)  NOT NULL,
    page_url             VARCHAR(512) NOT NULL,
    expires_at           TIMESTAMP(6) NOT NULL,
    -- monobank modifiedDate of the state we hold: webhooks may arrive out of order
    provider_modified_at TIMESTAMP(6) NULL,
    failure_reason       VARCHAR(512) NULL,
    err_code             VARCHAR(16)  NULL,
    masked_pan           VARCHAR(32)  NULL,
    payment_method       VARCHAR(16)  NULL,
    payment_system       VARCHAR(16)  NULL,
    rrn                  VARCHAR(64)  NULL,
    approval_code        VARCHAR(32)  NULL,
    fee_minor            BIGINT       NULL,
    -- when a success was credited to the order (exactly once)
    applied_at           TIMESTAMP(6) NULL,
    -- a refund was requested: keep polling the status until then
    refund_pending_until TIMESTAMP(6) NULL,
    created_at           TIMESTAMP(6) NOT NULL,
    updated_at           TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_payment_invoices_external (provider, external_id),
    KEY ix_payment_invoices_order (order_id),
    KEY ix_payment_invoices_status (status),
    CONSTRAINT fk_payment_invoices_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE payment_webhook_log (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    provider     VARCHAR(16)  NOT NULL,
    external_id  VARCHAR(64)  NULL,
    status       VARCHAR(16)  NULL,
    signature_ok BOOLEAN      NOT NULL,
    body         MEDIUMTEXT   NULL,
    received_at  TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id),
    KEY ix_payment_webhook_log_ext (external_id),
    KEY ix_payment_webhook_log_received (received_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- The seeded "full payment" option said "to the card"; now everything is paid online.
UPDATE payment_options SET title = 'Полная оплата онлайн'
 WHERE title = 'Полная оплата на карту';

-- The translated note / purpose of the card requisites (V29) are no longer shown anywhere, and the
-- backend enum no longer has PAYMENT_REQUISITES — without this an unknown entity_type would break
-- loading the whole translation overlay. The ENUM value itself stays for a rollback.
DELETE FROM content_translations WHERE entity_type = 'PAYMENT_REQUISITES';

-- The seeded chat template "Реквизиты для оплаты" (V26) sent the card details and asked for a
-- screenshot; the {requisites} placeholder is gone, so a template still built on it goes too.
DELETE FROM reply_templates WHERE body_ru LIKE '%{requisites}%';
