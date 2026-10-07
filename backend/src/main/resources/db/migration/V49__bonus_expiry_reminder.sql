-- ============================================================
--  Напоминание «бонус за отзыв скоро сгорит»: бот пишет владельцу личного
--  промокода за reviews.bonusExpiryReminderDays дней до конца срока (один раз
--  на код). expiry_reminded_at — когда напоминание ушло (или занято другим
--  экземпляром), чтобы не слать дважды.
-- ============================================================

ALTER TABLE promo_codes
    ADD COLUMN expiry_reminded_at TIMESTAMP NULL;

CREATE INDEX idx_promo_source_expires ON promo_codes (source, expires_at);
