-- The basket sent to monobank with each invoice (JSON). With fiscalisation on (Вчасно.Каса /
-- Checkbox), a refund must list the returned items so a return receipt can be issued; a full
-- refund sends exactly the lines that were sold.
ALTER TABLE payment_invoices
    ADD COLUMN basket_json TEXT NULL AFTER display_type;
