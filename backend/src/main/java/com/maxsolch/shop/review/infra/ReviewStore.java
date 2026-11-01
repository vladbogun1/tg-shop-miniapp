package com.maxsolch.shop.review.infra;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/**
 * Plain-SQL side of the reviews, over {@code product_reviews} only: the rating aggregate of a product, the newest
 * quotes and the rating counts of the whole shop. What belongs to other modules (the product, the order, the
 * customer) is asked from their services.
 */
@Repository
public class ReviewStore {

    /** Count and average (2 decimals, null when none) of the published reviews of one product. */
    public record Rating(int count, BigDecimal avg) {
    }

    /** A published review with text, as the site's reviews ribbon shows it, before the product is attached. */
    public record Quote(long id, String author, int rating, String text, Instant publishedAt, byte[] productId) {
    }

    /** How many published reviews of a product have this rating. */
    public record ProductRatingCount(byte[] productId, int rating, long count) {
    }

    private final JdbcTemplate jdbc;

    public ReviewStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** The published reviews of the product: how many and their average. */
    public Rating ratingOf(byte[] productId) {
        return jdbc.queryForObject("select count(*), round(avg(rating), 2) from product_reviews "
                        + "where product_id = ? and status = 'PUBLISHED'",
                (rs, i) -> new Rating(rs.getInt(1), rs.getBigDecimal(2)), productId);
    }

    /**
     * The published reviews that have a text, newest first, one page at {@code offset}. Rating-only reviews make no
     * sense in a ribbon of quotes.
     */
    public List<Quote> latestQuotes(int limit, int offset) {
        return jdbc.query("select id, author_name, rating, text, published_at, product_id from product_reviews "
                        + "where status = 'PUBLISHED' and char_length(trim(text)) > 0 "
                        + "order by published_at desc, id desc limit ? offset ?",
                (rs, i) -> {
                    Timestamp published = rs.getTimestamp("published_at");
                    return new Quote(rs.getLong("id"), rs.getString("author_name"), rs.getInt("rating"),
                            rs.getString("text"), published == null ? null : published.toInstant(),
                            rs.getBytes("product_id"));
                }, limit, offset);
    }

    /** Published reviews counted per product and rating (the whole shop, one row per pair). */
    public List<ProductRatingCount> publishedCounts() {
        return jdbc.query("select product_id, rating, count(*) n from product_reviews where status = 'PUBLISHED' "
                        + "group by product_id, rating",
                (rs, i) -> new ProductRatingCount(rs.getBytes(1), rs.getInt(2), rs.getLong(3)));
    }

    /** Short ids of orders (first 8 chars of the UUID) — for admin rows. */
    public static String shortId(byte[] orderId) {
        String id = orderId == null ? null : com.maxsolch.shop.platform.util.UuidUtil.toString(orderId);
        return id == null ? null : id.substring(0, 8);
    }
}
