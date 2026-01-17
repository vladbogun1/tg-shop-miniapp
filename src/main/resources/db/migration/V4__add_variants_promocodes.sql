CREATE TABLE product_variants (
  id BINARY(16) PRIMARY KEY,
  product_id BINARY(16) NOT NULL,
  name VARCHAR(128) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_product_variants_product
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

ALTER TABLE order_items
  ADD COLUMN variant_id BINARY(16) NULL,
  ADD COLUMN variant_name_snapshot VARCHAR(128) NULL;

ALTER TABLE orders
  ADD COLUMN promo_code VARCHAR(64) NULL,
  ADD COLUMN subtotal_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN discount_minor BIGINT NOT NULL DEFAULT 0;

CREATE TABLE promo_codes (
  id BINARY(16) PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  discount_percent INT NOT NULL DEFAULT 0,
  max_uses INT NULL,
  uses_count INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX ux_promo_codes_code ON promo_codes(code);
