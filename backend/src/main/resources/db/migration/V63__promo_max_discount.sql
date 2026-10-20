-- ============================================================
--  Потолок скидки промокода в гривнах (docs/ORDERS-SUPPORT-REVIEWS.md, «Бонус за отзыв»).
--
--  promo_codes.max_discount_minor — скидка по коду не больше этой суммы (копейки);
--  0 = без потолка (все прежние коды). Считается после вычета товаров, на которые код
--  не действует, и процента: «5 %, но не больше 100 ₴».
--
--  Бонус за отзыв (source = REVIEW_BONUS) получает потолок из настройки
--  reviews.bonusMaxDiscountUah (по умолчанию 100 ₴). Уже выданные, ещё не
--  использованные и не сгоревшие THANKS-коды получают тот же потолок здесь.
--
--  V63: V61/V62 заняты «Разом дешевше» (feat/bundles, ещё не на проде).
--  Аддитивная: откат — только образами (старый бэкенд колонку не читает).
-- ============================================================
ALTER TABLE promo_codes
    ADD COLUMN max_discount_minor BIGINT NOT NULL DEFAULT 0 AFTER discount_amount_minor;

UPDATE promo_codes
   SET max_discount_minor = 10000
 WHERE source = 'REVIEW_BONUS'
   AND max_discount_minor = 0
   AND discount_percent > 0
   AND active = TRUE
   AND uses_count < COALESCE(max_uses, 2147483647)
   AND (expires_at IS NULL OR expires_at > NOW());
