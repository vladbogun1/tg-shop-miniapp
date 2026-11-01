package com.maxsolch.shop.review.app;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.it.AbstractMysqlIT;
import com.maxsolch.shop.order.app.Checkout;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.review.domain.ProductReview;
import com.maxsolch.shop.review.infra.ProductReviewRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * What the review module does with the rows of other modules (orders, products, promo codes, users), on a real MySQL.
 * Pins the behavior before and after those writes moved behind the owners' services (audit package 5, P2-25).
 */
class ReviewDbBoundsIT extends AbstractMysqlIT {

    private static final long BASE = 9_300_000_000_000L;

    @Autowired
    Checkout checkout;
    @Autowired
    ReviewBonus bonus;
    @Autowired
    ReviewPublishing publishing;
    @Autowired
    ReviewFeedService feed;
    @Autowired
    ReviewReminderJob reminderJob;
    @Autowired
    BonusExpiryReminderJob expiryJob;
    @Autowired
    ProductReviewRepository reviews;

    @MockitoBean
    ReviewNotifier notifier;

    private static long nextTg = BASE;

    private long newUser(boolean blocked) {
        long tg = nextTg++ + (System.nanoTime() % 1_000_000) * 100;
        jdbc.update("INSERT INTO users (telegram_user_id, username, first_name, created_at, last_seen_at, is_premium, "
                + "bot_blocked) VALUES (?, ?, 'IT', now(), now(), false, ?)", tg, "it_" + tg, blocked);
        return tg;
    }

    private byte[] orderOf(long tg, Product p, int qty) {
        return checkout.createOrder(checkout(tg, "+380990" + (tg % 1_000_000), p, qty)).getId();
    }

    private long itemOf(byte[] orderId) {
        return jdbc.queryForObject("SELECT id FROM order_items WHERE order_id = ? ORDER BY id LIMIT 1", Long.class, orderId);
    }

    private long review(Product p, long tg, byte[] orderId, Long itemId, int rating, String status, String text) {
        jdbc.update("INSERT INTO product_reviews (product_id, order_id, order_item_id, user_id, tg_user_id, author_name, "
                        + "rating, text, status, published_at) VALUES (?, ?, ?, ?, ?, 'IT', ?, ?, ?, "
                        + "CASE WHEN ? = 'PUBLISHED' THEN now() ELSE NULL END)",
                p.getId(), orderId, itemId, tg, tg, rating, text, status, status);
        return jdbc.queryForObject("SELECT max(id) FROM product_reviews WHERE user_id = ?", Long.class, tg);
    }

    private void delivered(byte[] orderId, Instant at) {
        jdbc.update("UPDATE orders SET status = 'DELIVERED', delivered_at = ? WHERE id = ?", Timestamp.from(at), orderId);
    }

    @Test
    void firstPublishedReviewOfOrderIssuesOneBonusCode() {
        long tg = newUser(false);
        Product p = product(10_000, 5);
        byte[] order = orderOf(tg, p, 1);
        ProductReview r = reviews.findById(review(p, tg, order, itemOf(order), 5, "PUBLISHED", "ok")).orElseThrow();

        var first = tx.execute(s -> bonus.issueIfFirst(r));
        var second = tx.execute(s -> bonus.issueIfFirst(r));

        assertThat(first).isNotNull();
        assertThat(second).isNull();
        assertThat(jdbc.queryForObject("SELECT review_bonus_issued_at FROM orders WHERE id = ?", Timestamp.class, order))
                .isNotNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM promo_codes WHERE source = 'REVIEW_BONUS' AND source_order_id = ?"
                + " AND owner_user_id = ?", Integer.class, order, tg)).isEqualTo(1);
    }

    @Test
    void rolledBackReviewLeavesNoClaimedBonus() {
        long tg = newUser(false);
        Product p = product(10_000, 5);
        byte[] order = orderOf(tg, p, 1);
        ProductReview r = reviews.findById(review(p, tg, order, itemOf(order), 5, "PUBLISHED", "ok")).orElseThrow();

        tx.execute(s -> {
            bonus.issueIfFirst(r);
            s.setRollbackOnly();
            return null;
        });

        assertThat(jdbc.queryForObject("SELECT review_bonus_issued_at FROM orders WHERE id = ?", Timestamp.class, order))
                .isNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM promo_codes WHERE source_order_id = ?", Integer.class, order))
                .isZero();
    }

    @Test
    void ratingAggregateCountsPublishedReviewsOnly() {
        Product p = product(10_000, 5);
        long a = newUser(false);
        long b = newUser(false);
        long c = newUser(false);
        review(p, a, null, null, 5, "PUBLISHED", "five");
        review(p, b, null, null, 4, "PUBLISHED", "four");
        review(p, c, null, null, 1, "PENDING", "not yet");

        tx.execute(s -> {
            publishing.ratingChanged(p.getId());
            return null;
        });

        assertThat(jdbc.queryForObject("SELECT rating_count FROM products WHERE id = ?", Integer.class, p.getId()))
                .isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT rating_avg FROM products WHERE id = ?", java.math.BigDecimal.class, p.getId()))
                .isEqualByComparingTo("4.50");

        jdbc.update("UPDATE product_reviews SET status = 'HIDDEN' WHERE user_id IN (?, ?)", a, b);
        tx.execute(s -> {
            publishing.ratingChanged(p.getId());
            return null;
        });
        assertThat(jdbc.queryForObject("SELECT rating_count FROM products WHERE id = ?", Integer.class, p.getId())).isZero();
        assertThat(jdbc.queryForObject("SELECT rating_avg FROM products WHERE id = ?", java.math.BigDecimal.class, p.getId()))
                .isNull();
    }

    @Test
    void feedShowsPublishedQuotesWithProductAndSkipsDeletedProducts() {
        Product live = product(10_000, 5);
        Product hidden = product(10_000, 5);
        jdbc.update("UPDATE products SET active = false WHERE id = ?", hidden.getId());
        jdbc.update("INSERT INTO product_images (product_id, url, sort_order) VALUES (?, 'http://img/it.jpg', 0)", live.getId());
        long u1 = newUser(false);
        long u2 = newUser(false);
        long u3 = newUser(false);
        long u4 = newUser(false);
        long r1 = review(live, u1, null, null, 5, "PUBLISHED", "quote on a live product");
        long r2 = review(hidden, u2, null, null, 4, "PUBLISHED", "quote on a hidden product");
        review(live, u3, null, null, 3, "PUBLISHED", "");
        // no foreign key on product_id: a review of a product that is gone must not show
        jdbc.update("INSERT INTO product_reviews (product_id, user_id, author_name, rating, text, status, published_at) "
                + "VALUES (?, ?, 'IT', 2, 'orphan quote', 'PUBLISHED', now())", UuidUtil.toBytes(UUID.randomUUID().toString()), u4);

        var result = feed.latest(500, "uk");

        assertThat(result.items()).extracting(ReviewDtos.FeedReview::id).contains(r1, r2);
        assertThat(result.items()).extracting(ReviewDtos.FeedReview::text)
                .doesNotContain("", "orphan quote");
        var liveItem = result.items().stream().filter(i -> i.id() == r1).findFirst().orElseThrow();
        var hiddenItem = result.items().stream().filter(i -> i.id() == r2).findFirst().orElseThrow();
        assertThat(liveItem.productSlug()).isNotNull();
        assertThat(liveItem.imageUrl()).isEqualTo("http://img/it.jpg");
        assertThat(hiddenItem.productSlug()).isNull();
        // the summary counts every published review of an existing product, text or not, hidden product too
        long expected = jdbc.queryForObject("SELECT count(*) FROM product_reviews r JOIN products p ON p.id = r.product_id "
                + "WHERE r.status = 'PUBLISHED'", Long.class);
        assertThat(result.summary().count()).isEqualTo(expected);
    }

    @Test
    void reminderGoesOnceToDeliveredOrdersWithUnreviewedLinesAndNotToBlockedUsers() {
        reset(notifier);
        when(notifier.enabled()).thenReturn(true);
        when(notifier.reminder(anyLong(), any(), anyInt(), anyLong())).thenReturn(true);
        Product p = product(10_000, 20);
        Instant at = Instant.now().minus(Duration.ofDays(2)).minus(Duration.ofHours(1));

        long due = newUser(false);
        byte[] dueOrder = orderOf(due, p, 1);
        delivered(dueOrder, at);

        long blocked = newUser(true);
        byte[] blockedOrder = orderOf(blocked, p, 1);
        delivered(blockedOrder, at);

        long reviewed = newUser(false);
        byte[] reviewedOrder = orderOf(reviewed, p, 1);
        delivered(reviewedOrder, at);
        review(p, reviewed, reviewedOrder, itemOf(reviewedOrder), 5, "PENDING", "already reviewed");

        long returned = newUser(false);
        byte[] returnedOrder = orderOf(returned, p, 1);
        delivered(returnedOrder, at);
        jdbc.update("UPDATE order_items SET returned_qty = quantity WHERE order_id = ?", returnedOrder);

        long notYet = newUser(false);
        byte[] notYetOrder = orderOf(notYet, p, 1);
        delivered(notYetOrder, Instant.now().minus(Duration.ofHours(5)));

        reminderJob.run();
        reminderJob.run();

        verify(notifier).reminder(eq(due), eq(dueOrder), anyInt(), anyLong());
        verify(notifier, never()).reminder(eq(blocked), any(), anyInt(), anyLong());
        verify(notifier, never()).reminder(eq(reviewed), any(), anyInt(), anyLong());
        verify(notifier, never()).reminder(eq(returned), any(), anyInt(), anyLong());
        verify(notifier, never()).reminder(eq(notYet), any(), anyInt(), anyLong());
        assertThat(sentAt("review_reminder_sent_at", dueOrder)).isNotNull();
        assertThat(sentAt("review_reminder_sent_at", blockedOrder)).isNull();
        assertThat(sentAt("review_reminder_sent_at", reviewedOrder)).isNull();
    }

    @Test
    void bonusExpiryReminderGoesOnceToUnblockedOwnersOfUnusedCodes() {
        reset(notifier);
        when(notifier.enabled()).thenReturn(true);
        when(notifier.bonusExpiring(anyLong(), any(), anyInt(), anyLong(), any())).thenReturn(true);
        long owner = newUser(false);
        long blocked = newUser(true);
        long usedUp = newUser(false);
        String dueCode = bonusCode(owner, 0);
        String blockedCode = bonusCode(blocked, 0);
        String usedCode = bonusCode(usedUp, 1);

        expiryJob.run();
        expiryJob.run();

        verify(notifier).bonusExpiring(eq(owner), eq(dueCode), anyInt(), anyLong(), any());
        verify(notifier, never()).bonusExpiring(eq(blocked), any(), anyInt(), anyLong(), any());
        verify(notifier, never()).bonusExpiring(eq(usedUp), any(), anyInt(), anyLong(), any());
        assertThat(remindedAt(dueCode)).isNotNull();
        assertThat(remindedAt(blockedCode)).isNull();
        assertThat(remindedAt(usedCode)).isNull();
    }

    private String bonusCode(long owner, int uses) {
        String code = "IT" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        jdbc.update("INSERT INTO promo_codes (id, code, discount_percent, discount_amount_minor, max_discount_minor, max_uses, "
                        + "uses_count, active, owner_user_id, expires_at, source, created_at) "
                        + "VALUES (?, ?, 5, 0, 10000, 1, ?, true, ?, ?, 'REVIEW_BONUS', ?)", UuidUtil.toBytes(UUID.randomUUID().toString()), code, uses, owner,
                Timestamp.from(Instant.now().plus(Duration.ofDays(1))),
                Timestamp.from(Instant.now().minus(Duration.ofDays(10))));
        return code;
    }

    private Timestamp remindedAt(String code) {
        return jdbc.queryForObject("SELECT expiry_reminded_at FROM promo_codes WHERE code = ?", Timestamp.class, code);
    }

    private Timestamp sentAt(String column, byte[] orderId) {
        return jdbc.queryForObject("SELECT " + column + " FROM orders WHERE id = ?", Timestamp.class, orderId);
    }

}
