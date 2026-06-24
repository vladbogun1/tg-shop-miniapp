-- Track the actual amount received per order so наложка (COD) is exact instead of
-- being guessed from a paid flag (which wrongly assumed prepayment orders were paid
-- in full when an admin marked them paid).
ALTER TABLE orders ADD COLUMN received_minor BIGINT NOT NULL DEFAULT 0;

-- Recover the prepayment snapshot for OLD prepayment orders (created before V7, so
-- prepayment_minor defaulted to 0) from their payment option — needed for both the
-- "предоплата" preset and the correct received/наложка backfill below.
UPDATE orders o
  JOIN payment_options p ON o.payment_option_id = p.id
  SET o.prepayment_minor = p.prepayment_minor
  WHERE o.prepayment_minor = 0 AND p.requires_prepayment = 1 AND p.prepayment_minor > 0;

-- Backfill received_minor for orders already marked paid so nothing regresses:
--  * delivered orders are fully settled (COD collected)            -> total
--  * prepayment orders that were marked paid received the prepayment -> prepayment
--  * everything else paid was a full payment                        -> total
UPDATE orders
  SET received_minor = CASE
        WHEN status = 'DELIVERED' THEN total_minor
        WHEN prepayment_minor > 0 THEN prepayment_minor
        ELSE total_minor
      END
  WHERE paid = TRUE;
