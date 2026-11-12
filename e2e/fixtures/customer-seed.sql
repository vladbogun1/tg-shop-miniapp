-- ============================================================================
--  Customer smoke (playwright.customer.config.ts): rows added on top of fixtures/seed.sql.
--  Applied only by global-setup.customer.ts — the admin e2e never sees them, so its counts stay as they were.
--  No schema changes: only INSERTs into existing tables. Specs make their own customer per test (a fresh
--  Telegram id), so nothing below is consumed twice, except the shop-wide counters (stock, promo uses).
-- ============================================================================
SET NAMES utf8mb4;

-- seed.sql does not know these tables: clear what an earlier run left (the specs make orders, which seed.sql already deleted).
SET FOREIGN_KEY_CHECKS = 0;
DELETE FROM order_gift_cases;
DELETE FROM gift_case_items;
SET FOREIGN_KEY_CHECKS = 1;

-- A code that never runs out (the admin seed's codes have 1-2 uses).
INSERT INTO promo_codes (id, code, discount_percent, discount_amount_minor, max_uses, uses_count, active) VALUES
  (UUID_TO_BIN('e2ec0001-0000-4000-8000-000000000001'), 'E2ESMOKE10', 10, 0, 1000000, 0, TRUE);

-- The Nova Poshta directory (e2e-city, e2e-wh-1 / e2e-wh-2) comes with fixtures/seed.sql.

-- Gift case (V57): the tiers come with the migration (BRONZE from 1 500 ₴, a guaranteed 3 % up to 100 ₴
-- against opening the case); the settings gift.enabled / gift.caseEnabled are switched on by the global
-- setup through the admin API. Bronze prizes: a product and a 10 % discount.
INSERT INTO gift_case_items (tier, kind, product_id, discount_percent, discount_uah, rarity, weight, sort_order, active) VALUES
  ('BRONZE', 'PRODUCT', UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000004'), 0, 0, 'COMMON', 600000, 0, TRUE),
  ('BRONZE', 'DISCOUNT', NULL, 10, 0, 'RARE', 400000, 1, TRUE);
