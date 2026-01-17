ALTER TABLE promo_codes
  ADD COLUMN discount_amount_minor BIGINT NOT NULL DEFAULT 0;
