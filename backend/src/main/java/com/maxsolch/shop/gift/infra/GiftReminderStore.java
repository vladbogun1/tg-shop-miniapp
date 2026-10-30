package com.maxsolch.shop.gift.infra;

import com.maxsolch.shop.gift.domain.PromoReminder;
import com.maxsolch.shop.promo.domain.PromoCode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/** The promo codes of gift cases that are about to expire, and the mark that a reminder was taken for one. */
@Repository
public class GiftReminderStore {

    private final JdbcTemplate jdbc;

    public GiftReminderStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Unused, still valid case codes expiring in {@code (now, expiresBy]}, issued no later than
     * {@code issuedBefore}, not reminded yet, of an order with a Telegram chat whose owner has not
     * blocked the bot; soonest first.
     */
    public List<PromoReminder> candidates(Instant now, Instant expiresBy, Instant issuedBefore, int limit) {
        return jdbc.query("select p.id, p.source_order_id, p.code, p.discount_percent, p.discount_amount_minor, "
                        + "p.expires_at from promo_codes p "
                        + "join orders o on o.id = p.source_order_id "
                        + "left join users u on u.telegram_user_id = o.tg_user_id "
                        + "where p.source = '" + PromoCode.SOURCE_GIFT_CASE + "' and p.active = true "
                        + "and p.expiry_reminded_at is null "
                        + "and o.tg_user_id is not null and o.tg_user_id > 0 "
                        + "and p.expires_at > ? and p.expires_at <= ? and p.created_at <= ? "
                        + "and (p.max_uses is null or p.uses_count < p.max_uses) "
                        + "and coalesce(u.bot_blocked, false) = false "
                        + "order by p.expires_at limit ?",
                (rs, i) -> new PromoReminder(rs.getBytes("id"), rs.getBytes("source_order_id"), rs.getString("code"),
                        rs.getInt("discount_percent"), rs.getLong("discount_amount_minor"),
                        rs.getTimestamp("expires_at").toInstant()),
                Timestamp.from(now), Timestamp.from(expiresBy), Timestamp.from(issuedBefore), limit);
    }

    /** Takes the reminder of a code; false when somebody took it first (a second instance, a retry). */
    public boolean claim(byte[] promoId, Instant now) {
        return jdbc.update("update promo_codes set expiry_reminded_at = ? where id = ? and expiry_reminded_at is null",
                Timestamp.from(now), promoId) == 1;
    }
}
