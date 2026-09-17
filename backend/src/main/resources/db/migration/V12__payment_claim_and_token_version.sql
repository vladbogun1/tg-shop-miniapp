-- ============================================================
--  Безопасность оплаты + отзыв админских токенов.
-- ============================================================

-- 1) Заявка на оплату ≠ подтверждённая оплата.
--    Раньше покупатель, загрузив ЛЮБОЙ скрин, сразу выставлял paid=true и
--    received=total, из-за чего наложка (COD) обнулялась и продавец отправлял
--    товар без оплаты. Теперь скрин ставит только ЗАЯВКУ; received/paid меняет
--    исключительно админ.
ALTER TABLE orders
    ADD COLUMN payment_claimed    BOOLEAN   NOT NULL DEFAULT FALSE AFTER paid_at,
    ADD COLUMN payment_claimed_at TIMESTAMP NULL               AFTER payment_claimed;

-- Уже оплаченные заказы считаем и заявленными (админ их так или иначе видел).
UPDATE orders
   SET payment_claimed = TRUE,
       payment_claimed_at = COALESCE(paid_at, updated_at)
 WHERE paid = TRUE;

-- 2) Версия токена админа — даёт возможность разом отозвать все выданные JWT
--    (смена пароля, деактивация, "выйти на всех устройствах"). JWT живёт 30
--    дней и до сих пор переживал и деактивацию, и смену пароля.
ALTER TABLE admin_users
    ADD COLUMN token_version INT NOT NULL DEFAULT 0 AFTER password_hash;
