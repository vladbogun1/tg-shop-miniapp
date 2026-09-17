-- ============================================================
--  Резерв промокода за покупателем.
--
--  Промокод проверяется теперь ещё в корзине, а не на последнем шаге оформления.
--  Но у лимитированного кода между «показали скидку» и «создали заказ» проходит
--  время, и его мог забрать кто-то другой — покупатель увидел бы цену со скидкой,
--  а на оформлении получил «invalid promo code».
--
--  Резерв держится 30 минут: свободных применений = max_uses - uses_count
--  минус чужие живые резервы. Протухшие строки подчищает планировщик,
--  но и без него они не считаются — фильтр всегда по expires_at.
--  Безлимитные коды (max_uses IS NULL) не резервируются вовсе.
-- ============================================================

CREATE TABLE promo_reservations (
    id               BINARY(16) NOT NULL,
    promo_code_id    BINARY(16) NOT NULL,
    telegram_user_id BIGINT     NOT NULL,
    expires_at       TIMESTAMP  NOT NULL,
    created_at       TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    -- Один живой резерв на пару «код + покупатель»: повторный запрос продлевает его,
    -- а не плодит строки, которые вместе съели бы весь лимит кода.
    UNIQUE KEY ux_promo_reservation (promo_code_id, telegram_user_id),
    KEY idx_promo_reservation_expires (expires_at),
    CONSTRAINT fk_promo_reservation_code FOREIGN KEY (promo_code_id)
        REFERENCES promo_codes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
