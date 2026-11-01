package com.maxsolch.shop.promo.infra;

import com.maxsolch.shop.promo.domain.ExpiringPromo;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/** Plain SQL behind the expiry reminders of promo codes: the scan and the once-only claim. */
@Repository
public class PromoExpiryStore {

    private final JdbcTemplate jdbc;

    public PromoExpiryStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Active, not reminded, not used up codes of {@code source} expiring in {@code (now, expiresBy]}, created no
     * later than {@code issuedBefore}; soonest first, one page at {@code offset}.
     */
    public List<ExpiringPromo> page(String source, Instant now, Instant expiresBy, Instant issuedBefore, int limit, int offset) {
        return jdbc.query("select id, code, discount_percent, discount_amount_minor, max_discount_minor, owner_user_id, "
                        + "source_order_id, expires_at from promo_codes "
                        + "where source = ? and active = true and expiry_reminded_at is null "
                        + "and expires_at > ? and expires_at <= ? and created_at <= ? "
                        + "and (max_uses is null or uses_count < max_uses) "
                        + "order by expires_at, id limit ? offset ?",
                (rs, i) -> new ExpiringPromo(rs.getBytes("id"), rs.getString("code"), rs.getInt("discount_percent"),
                        rs.getLong("discount_amount_minor"), rs.getLong("max_discount_minor"),
                        rs.getObject("owner_user_id") == null ? null : rs.getLong("owner_user_id"),
                        rs.getBytes("source_order_id"), rs.getTimestamp("expires_at").toInstant()),
                source, Timestamp.from(now), Timestamp.from(expiresBy), Timestamp.from(issuedBefore), limit, offset);
    }

    /** Marks the reminder of a code as taken; false when somebody took it first. */
    public boolean claim(byte[] promoId, Instant now) {
        return jdbc.update("update promo_codes set expiry_reminded_at = ? where id = ? and expiry_reminded_at is null",
                Timestamp.from(now), promoId) == 1;
    }

    /** Takes the claim back after a failed send; only if it is still the caller's. */
    public void release(byte[] promoId, Instant claimedAt) {
        jdbc.update("update promo_codes set expiry_reminded_at = null where id = ? and expiry_reminded_at = ?",
                promoId, Timestamp.from(claimedAt));
    }
}
