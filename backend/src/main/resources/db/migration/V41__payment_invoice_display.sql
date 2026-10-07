-- How the monobank payment page of an invoice is shown: 'page' (redirect / new window) or
-- 'iframe' (embedded in our modal, created with displayType=iframe). A live invoice is reused
-- only for the same mode — the iframe page has its own layout.
ALTER TABLE payment_invoices
    ADD COLUMN display_type VARCHAR(8) NOT NULL DEFAULT 'page' AFTER page_url;
