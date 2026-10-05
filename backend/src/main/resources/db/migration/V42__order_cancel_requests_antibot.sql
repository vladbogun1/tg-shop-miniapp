-- ============================================================
--  Phase A (docs/ORDERS-SUPPORT-REVIEWS.md): customer cancellation + anti-bot.
--
--  * cancel_request_* — a paid order (NEW/APPROVED) cannot be cancelled by the
--    customer directly: they file a request with a reason, an admin approves it
--    (order rejected, restocked, money refunded through monobank) or declines it
--    with a comment. One request per order: after DECLINED no new one.
--    status: PENDING | APPROVED | DECLINED, NULL = never requested.
--  * cancelled_by_customer — the order was cancelled on the customer's initiative
--    (immediate cancel of an unpaid order, or an approved request). Feeds the
--    anti-bot limit antibot.maxSelfCancelsPerDay; admin rejects never set it.
--  The index serves the per-customer anti-bot counters (unpaid / per day / cancels).
-- ============================================================

ALTER TABLE orders
    ADD COLUMN cancel_request_status        VARCHAR(16)  NULL,
    ADD COLUMN cancel_request_reason        VARCHAR(500) NULL,
    ADD COLUMN cancel_requested_at          TIMESTAMP    NULL,
    ADD COLUMN cancel_request_resolved_at   TIMESTAMP    NULL,
    ADD COLUMN cancel_request_admin_comment VARCHAR(1000) NULL,
    ADD COLUMN cancelled_by_customer        BOOLEAN      NOT NULL DEFAULT FALSE;

CREATE INDEX idx_orders_user_created ON orders (user_id, created_at);
