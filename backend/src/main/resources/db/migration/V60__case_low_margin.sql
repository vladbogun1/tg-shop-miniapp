-- ============================================================
--  Кейс для товаров с низкой маржой (docs/GIFT-CASE.md, «Товары с упором на скидки»).
--
--  Бренды и товары, на которых магазин почти ничего не зарабатывает (настройки
--  gift.lowMarginBrands / gift.lowMarginProducts), кейс не теряют, но в заказе с ними
--  товарные призы выпадают реже: все вместе — low_margin_product_percent % шанса уровня,
--  остальное делят призы-скидки на следующий заказ (соотношения внутри групп те же).
--  Промокоды из кейса на такие товары не действуют.
--
--  order_gift_cases.low_margin — кейс разыгран с упором на скидки (для админки).
--  V61, а не V60: V58/V60 заняты «Вместе дешевле» (feat/bundles, ещё не на проде).
-- ============================================================
ALTER TABLE gift_case_tiers
    ADD COLUMN low_margin_product_percent INT NOT NULL DEFAULT 10 AFTER promo_valid_days;

ALTER TABLE order_gift_cases
    ADD COLUMN low_margin TINYINT(1) NOT NULL DEFAULT 0 AFTER swap_amount_minor;
