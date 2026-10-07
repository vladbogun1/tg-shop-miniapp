package com.maxsolch.shop.review;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.review.ReviewDtos.Summary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Plain-SQL side of the reviews: the once-only flags on orders (claimed atomically with
 * {@code ... where flag is null}), the rating aggregate on products, and the reminder scan.
 */
@Repository
public class ReviewStore {

    private final JdbcTemplate jdbc;

    public ReviewStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Claims the order's review bonus. True exactly once per order — concurrent publishes of two
     * reviews of the same order cannot both issue a code.
     */
    public boolean claimBonus(byte[] orderId, Instant now) {
        return jdbc.update("update orders set review_bonus_issued_at = ? "
                + "where id = ? and review_bonus_issued_at is null", Timestamp.from(now), orderId) == 1;
    }

    /** Claims the order's reminder; true exactly once per order. */
    public boolean claimReminder(byte[] orderId, Instant now) {
        return jdbc.update("update orders set review_reminder_sent_at = ? "
                + "where id = ? and review_reminder_sent_at is null", Timestamp.from(now), orderId) == 1;
    }

    /** Recomputes {@code products.rating_avg/rating_count} from the published reviews. */
    public void recomputeRating(byte[] productId) {
        jdbc.update("update products p set "
                + "p.rating_count = (select count(*) from product_reviews r "
                + "  where r.product_id = p.id and r.status = 'PUBLISHED'), "
                + "p.rating_avg = (select round(avg(r.rating), 2) from product_reviews r "
                + "  where r.product_id = p.id and r.status = 'PUBLISHED') "
                + "where p.id = ?", productId);
    }

    /** Product id by its public slug. */
    public Optional<byte[]> productIdBySlug(String slug) {
        List<byte[]> ids = jdbc.query("select id from products where slug = ?", (rs, i) -> rs.getBytes(1), slug);
        return ids.isEmpty() ? Optional.empty() : Optional.of(ids.get(0));
    }

    /** What the review screens show about a product: current title, slug, first image. */
    public record ProductInfo(String title, String slug, String imageUrl) {
    }

    /** Product info by id (UUID string), for a set of products. Missing (deleted) ones are absent. */
    public Map<String, ProductInfo> productInfos(Collection<byte[]> productIds) {
        Map<String, ProductInfo> out = new HashMap<>();
        if (productIds == null || productIds.isEmpty()) {
            return out;
        }
        String in = String.join(",", java.util.Collections.nCopies(productIds.size(), "?"));
        jdbc.query("select p.id, p.title, p.slug, "
                        + "(select i.url from product_images i where i.product_id = p.id "
                        + " order by i.sort_order, i.id limit 1) img "
                        + "from products p where p.id in (" + in + ")",
                rs -> {
                    out.put(UuidUtil.toString(rs.getBytes("id")),
                            new ProductInfo(rs.getString("title"), rs.getString("slug"), rs.getString("img")));
                }, productIds.toArray());
        return out;
    }

    /** A published review with text, as the site's home-page reviews ribbon shows it. */
    public record FeedRow(long id, String author, int rating, String text, Instant publishedAt,
                          String productId, String productTitle, String productSlug, String imageUrl) {
    }

    /**
     * The newest published reviews that have a text, of active products only, newest first.
     * Rating-only reviews make no sense in a ribbon of quotes; hidden products must not be linked.
     */
    public List<FeedRow> latestFeed(int limit) {
        return jdbc.query("select r.id, r.author_name, r.rating, r.text, r.published_at, "
                        + "p.id pid, p.title, p.slug, "
                        + "(select i.url from product_images i where i.product_id = p.id "
                        + " order by i.sort_order, i.id limit 1) img "
                        + "from product_reviews r join products p on p.id = r.product_id "
                        + "where r.status = 'PUBLISHED' and p.active = true and char_length(trim(r.text)) > 0 "
                        + "order by r.published_at desc, r.id desc limit ?",
                (rs, i) -> {
                    Timestamp published = rs.getTimestamp("published_at");
                    return new FeedRow(rs.getLong("id"), rs.getString("author_name"), rs.getInt("rating"),
                            rs.getString("text"), published == null ? null : published.toInstant(),
                            UuidUtil.toString(rs.getBytes("pid")), rs.getString("title"), rs.getString("slug"),
                            rs.getString("img"));
                }, limit);
    }

    /** {@code [avg, count]} over all published reviews of active products; avg null when none. */
    public Summary shopSummary() {
        long[] dist = new long[5];
        long[] total = {0, 0};
        jdbc.query("select r.rating, count(*) n from product_reviews r join products p on p.id = r.product_id "
                + "where r.status = 'PUBLISHED' and p.active = true group by r.rating", rs -> {
            int rating = rs.getInt(1);
            long n = rs.getLong(2);
            if (rating >= 1 && rating <= 5) {
                dist[rating - 1] += n;
                total[0] += n;
                total[1] += (long) rating * n;
            }
        });
        Double avg = total[0] == 0 ? null : Math.round(total[1] * 100.0 / total[0]) / 100.0;
        return new Summary(avg, total[0], Arrays.stream(dist).boxed().toList());
    }

    /** A delivered order that may be due for a reminder (re-checked by {@link ReviewRules#reminderDue}). */
    public record ReminderCandidate(byte[] orderId, Long tgUserId, Instant deliveredAt, boolean hasPendingLines) {
    }

    /**
     * Delivered orders in {@code [deliveredFrom, deliveredTo]} with no reminder yet, a Telegram chat,
     * and at least one paid line without a review; oldest first.
     */
    public List<ReminderCandidate> reminderCandidates(Instant deliveredFrom, Instant deliveredTo, int limit) {
        return jdbc.query("select o.id, o.tg_user_id, o.delivered_at from orders o "
                        + "left join users u on u.telegram_user_id = o.tg_user_id "
                        + "where o.status = 'DELIVERED' and o.review_reminder_sent_at is null "
                        + "and o.delivered_at >= ? and o.delivered_at <= ? "
                        + "and o.tg_user_id is not null and o.tg_user_id > 0 "
                        + "and coalesce(u.bot_blocked, false) = false "
                        + "and exists (select 1 from order_items i where i.order_id = o.id and i.gift = false "
                        + "  and i.returned_qty < i.quantity "
                        + "  and not exists (select 1 from product_reviews r where r.order_item_id = i.id)) "
                        + "order by o.delivered_at limit ?",
                (rs, i) -> new ReminderCandidate(rs.getBytes("id"), rs.getLong("tg_user_id"),
                        rs.getTimestamp("delivered_at").toInstant(), true),
                Timestamp.from(deliveredFrom), Timestamp.from(deliveredTo), limit);
    }

    /** A review bonus that runs out soon and has not been used. */
    public record BonusExpiryCandidate(byte[] promoId, Long tgUserId, String code, int percent, Instant expiresAt) {
    }

    /**
     * Unused, still valid review bonuses expiring in {@code (now, expiresBy]}, issued no later than
     * {@code issuedBefore} (a code is not "about to run out" the day it was given), not reminded yet,
     * whose owner has not blocked the bot; soonest first.
     */
    public List<BonusExpiryCandidate> bonusExpiryCandidates(Instant now, Instant expiresBy, Instant issuedBefore,
                                                            int limit) {
        return jdbc.query("select p.id, p.owner_user_id, p.code, p.discount_percent, p.expires_at from promo_codes p "
                        + "left join users u on u.telegram_user_id = p.owner_user_id "
                        + "where p.source = 'REVIEW_BONUS' and p.active = true and p.expiry_reminded_at is null "
                        + "and p.owner_user_id is not null and p.owner_user_id > 0 "
                        + "and p.expires_at > ? and p.expires_at <= ? and p.created_at <= ? "
                        + "and (p.max_uses is null or p.uses_count < p.max_uses) "
                        + "and coalesce(u.bot_blocked, false) = false "
                        + "order by p.expires_at limit ?",
                (rs, i) -> new BonusExpiryCandidate(rs.getBytes("id"), rs.getLong("owner_user_id"),
                        rs.getString("code"), rs.getInt("discount_percent"),
                        rs.getTimestamp("expires_at").toInstant()),
                Timestamp.from(now), Timestamp.from(expiresBy), Timestamp.from(issuedBefore), limit);
    }

    /** Marks the expiry reminder of a code as sent; false when another run already took it. */
    public boolean claimBonusExpiryReminder(byte[] promoId, Instant now) {
        return jdbc.update("update promo_codes set expiry_reminded_at = ? "
                + "where id = ? and expiry_reminded_at is null", Timestamp.from(now), promoId) == 1;
    }

    /** Short ids of orders (first 8 chars of the UUID) — for admin rows. */
    public static String shortId(byte[] orderId) {
        String id = orderId == null ? null : UuidUtil.toString(orderId);
        return id == null ? null : id.substring(0, 8);
    }
}
