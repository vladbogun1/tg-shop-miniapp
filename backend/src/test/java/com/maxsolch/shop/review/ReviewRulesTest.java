package com.maxsolch.shop.review;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.review.ReviewRules.Eligibility;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/** Who may review what, and when the reminder is due — the pure rules behind ReviewService. */
class ReviewRulesTest {

    private static final long USER = 100L;
    private static final Instant NOW = Instant.parse("2026-10-05T12:00:00Z");

    static Order order(long userId, OrderStatus status) {
        Order o = new Order();
        o.setId(UuidUtil.randomBytes());
        o.setUserId(userId);
        o.setTgUserId(userId);
        o.setStatus(status);
        return o;
    }

    static OrderItem line(Order order, long id) {
        OrderItem i = new OrderItem();
        i.setId(id);
        i.setOrder(order);
        i.setProductId(UuidUtil.randomBytes());
        i.setTitleSnapshot("Мышь");
        i.setQuantity(1);
        order.getItems().add(i);
        return i;
    }

    @Test
    void ownDeliveredLineCanBeReviewed() {
        Order o = order(USER, OrderStatus.DELIVERED);
        assertThat(ReviewRules.eligibility(o, line(o, 1), USER, false)).isEqualTo(Eligibility.OK);
    }

    @ParameterizedTest
    @EnumSource(value = OrderStatus.class, names = "DELIVERED", mode = EnumSource.Mode.EXCLUDE)
    void onlyDeliveredOrders(OrderStatus status) {
        Order o = order(USER, status);
        assertThat(ReviewRules.eligibility(o, line(o, 1), USER, false)).isEqualTo(Eligibility.NOT_DELIVERED);
    }

    @Test
    void someoneElsesOrderIsNotYours() {
        Order o = order(200L, OrderStatus.DELIVERED);
        assertThat(ReviewRules.eligibility(o, line(o, 1), USER, false)).isEqualTo(Eligibility.NOT_YOURS);
        Order guest = order(USER, OrderStatus.DELIVERED);
        guest.setUserId(null);
        assertThat(ReviewRules.eligibility(guest, line(guest, 2), USER, false)).isEqualTo(Eligibility.NOT_YOURS);
    }

    @Test
    void onePerLine() {
        Order o = order(USER, OrderStatus.DELIVERED);
        assertThat(ReviewRules.eligibility(o, line(o, 1), USER, true)).isEqualTo(Eligibility.ALREADY_REVIEWED);
    }

    @Test
    void giftsAndReturnedLinesAreNotReviewed() {
        Order o = order(USER, OrderStatus.DELIVERED);
        OrderItem gift = line(o, 1);
        gift.setGift(true);
        OrderItem returned = line(o, 2);
        returned.setQuantity(2);
        returned.setReturnedQty(2);
        OrderItem partlyReturned = line(o, 3);
        partlyReturned.setQuantity(2);
        partlyReturned.setReturnedQty(1);

        assertThat(ReviewRules.eligibility(o, gift, USER, false)).isEqualTo(Eligibility.NOT_REVIEWABLE);
        assertThat(ReviewRules.eligibility(o, returned, USER, false)).isEqualTo(Eligibility.NOT_REVIEWABLE);
        assertThat(ReviewRules.eligibility(o, partlyReturned, USER, false)).isEqualTo(Eligibility.OK);
    }

    @Test
    void pendingLinesOfAnOrder() {
        Order o = order(USER, OrderStatus.DELIVERED);
        line(o, 1);
        line(o, 2);
        assertThat(ReviewRules.hasPendingLines(o, USER, id -> id == 1L)).isTrue();
        assertThat(ReviewRules.hasPendingLines(o, USER, id -> true)).isFalse();
        assertThat(ReviewRules.hasPendingLines(o, 200L, id -> false)).isFalse();
    }

    @Test
    void textAndRatingChecks() {
        assertThat(ReviewRules.textProblem("коротко", 10)).isEqualTo("api.review.tooShort");
        assertThat(ReviewRules.textProblem("достаточно длинный отзыв", 10)).isNull();
        assertThat(ReviewRules.textProblem("x".repeat(ReviewRules.MAX_TEXT + 1), 10)).isEqualTo("api.review.tooLong");
        assertThat(ReviewRules.validRating(0)).isFalse();
        assertThat(ReviewRules.validRating(1)).isTrue();
        assertThat(ReviewRules.validRating(5)).isTrue();
        assertThat(ReviewRules.validRating(6)).isFalse();
    }

    @Test
    void premoderationDecidesTheFirstStatus() {
        assertThat(ReviewRules.initialStatus(true)).isEqualTo(ReviewStatus.PENDING);
        assertThat(ReviewRules.initialStatus(false)).isEqualTo(ReviewStatus.PUBLISHED);
    }

    @Test
    void authorNameIsPrivacyFriendly() {
        assertThat(ReviewRules.authorName("Олена", "Коваль")).isEqualTo("Олена К.");
        assertThat(ReviewRules.authorName("Олена", null)).isEqualTo("Олена");
        assertThat(ReviewRules.authorName(" ", "коваль")).isEqualTo("К.");
        assertThat(ReviewRules.authorName(null, null)).isEmpty();
    }

    @Test
    void bonusCodeShape() {
        String code = ReviewRules.bonusCode();
        assertThat(code).matches("THANKS-[A-HJ-NP-Z2-9]{6}");
        assertThat(ReviewRules.bonusEnabled(0)).isFalse();
        assertThat(ReviewRules.bonusEnabled(5)).isTrue();
        assertThat(ReviewRules.bonusExpiry(NOW, 60)).isEqualTo(NOW.plus(Duration.ofDays(60)));
    }

    @Test
    void reminderIsDueAfterTheDelayOnlyOnce() {
        Instant delivered = NOW.minus(Duration.ofDays(3));
        assertThat(ReviewRules.reminderDue(OrderStatus.DELIVERED, delivered, null, USER, true, NOW, 2)).isTrue();
        // too early
        assertThat(ReviewRules.reminderDue(OrderStatus.DELIVERED, NOW.minus(Duration.ofDays(1)), null, USER, true,
                NOW, 2)).isFalse();
        // already sent
        assertThat(ReviewRules.reminderDue(OrderStatus.DELIVERED, delivered, NOW.minusSeconds(60), USER, true, NOW, 2))
                .isFalse();
        // nothing left to review
        assertThat(ReviewRules.reminderDue(OrderStatus.DELIVERED, delivered, null, USER, false, NOW, 2)).isFalse();
        // reminders off
        assertThat(ReviewRules.reminderDue(OrderStatus.DELIVERED, delivered, null, USER, true, NOW, 0)).isFalse();
        // returned after delivery / no chat
        assertThat(ReviewRules.reminderDue(OrderStatus.REJECTED, delivered, null, USER, true, NOW, 2)).isFalse();
        assertThat(ReviewRules.reminderDue(OrderStatus.DELIVERED, delivered, null, null, true, NOW, 2)).isFalse();
        // long-delivered orders are not reminded when the feature is switched on
        Instant old = NOW.minus(Duration.ofDays(2 + ReviewRules.REMINDER_WINDOW_DAYS + 1));
        assertThat(ReviewRules.reminderDue(OrderStatus.DELIVERED, old, null, USER, true, NOW, 2)).isFalse();
    }
}
