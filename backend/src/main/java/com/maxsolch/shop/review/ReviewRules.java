package com.maxsolch.shop.review;

import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderStatus;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.function.Predicate;

/**
 * Pure rules of the reviews feature (no I/O), shared by {@link ReviewService} and the reminder job
 * and unit-tested on their own.
 */
public final class ReviewRules {

    /** Upper bound of a review text; the column is 4000. */
    public static final int MAX_TEXT = 4000;
    /** Upper bound of an admin reply; the column is 2000. */
    public static final int MAX_REPLY = 2000;
    /** Prefix of a review-bonus promo code. */
    public static final String BONUS_PREFIX = "THANKS-";
    /**
     * A reminder is sent only for orders delivered within this many days past the reminder delay —
     * so switching the feature on does not message every customer who ever bought anything.
     */
    public static final int REMINDER_WINDOW_DAYS = 14;

    /** No 0/O/1/I: the code is read off a phone screen and typed back. */
    private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();

    private ReviewRules() {
    }

    /** Why a line cannot be reviewed; {@link #OK} when it can. Each maps to an {@code api.review.*} key. */
    public enum Eligibility {
        OK(null),
        NOT_YOURS("api.review.notYours"),
        NOT_DELIVERED("api.review.notDelivered"),
        NOT_REVIEWABLE("api.review.notReviewable"),
        ALREADY_REVIEWED("api.review.already");

        private final String messageKey;

        Eligibility(String messageKey) {
            this.messageKey = messageKey;
        }

        public String messageKey() {
            return messageKey;
        }
    }

    /**
     * May {@code userId} review this line? Only a line of their own DELIVERED order, not a free gift,
     * not returned in full, and not reviewed yet (one review per order line).
     *
     * @param alreadyReviewed whether a review of this line exists
     */
    public static Eligibility eligibility(Order order, OrderItem item, long userId, boolean alreadyReviewed) {
        if (order == null || item == null || order.getUserId() == null || order.getUserId() != userId) {
            return Eligibility.NOT_YOURS;
        }
        if (order.getStatus() != OrderStatus.DELIVERED) {
            return Eligibility.NOT_DELIVERED;
        }
        if (!isReviewableLine(item)) {
            return Eligibility.NOT_REVIEWABLE;
        }
        if (alreadyReviewed) {
            return Eligibility.ALREADY_REVIEWED;
        }
        return Eligibility.OK;
    }

    /** A paid line the customer still has: gifts and fully returned lines are not reviewed. */
    public static boolean isReviewableLine(OrderItem item) {
        return !item.isGift() && item.getReturnedQty() < item.getQuantity();
    }

    /** Lines of a delivered order of this customer that still wait for a review. */
    public static boolean hasPendingLines(Order order, long userId, Predicate<Long> reviewed) {
        if (order.getUserId() == null || order.getUserId() != userId || order.getStatus() != OrderStatus.DELIVERED) {
            return false;
        }
        return order.getItems().stream()
                .anyMatch(i -> isReviewableLine(i) && !reviewed.test(i.getId()));
    }

    /**
     * Text check. Returns the message key of the problem, or null when fine.
     *
     * @param text already trimmed
     */
    public static String textProblem(String text, int minLength) {
        int len = text == null ? 0 : text.codePointCount(0, text.length());
        if (len < Math.max(1, minLength)) {
            return "api.review.tooShort";
        }
        if (len > MAX_TEXT) {
            return "api.review.tooLong";
        }
        return null;
    }

    public static boolean validRating(int rating) {
        return rating >= 1 && rating <= 5;
    }

    /** Status of a new review: waits for an admin when premoderation is on, otherwise visible at once. */
    public static ReviewStatus initialStatus(boolean premoderation) {
        return premoderation ? ReviewStatus.PENDING : ReviewStatus.PUBLISHED;
    }

    /**
     * Privacy-friendly author: first name and the initial of the last name ("Олена К."); just the
     * first name, or the username's first letters when there is no name; empty when nothing is known
     * (the apps then show a localized "Покупець").
     */
    public static String authorName(String firstName, String lastName) {
        String first = firstName == null ? "" : firstName.trim();
        String last = lastName == null ? "" : lastName.trim();
        if (first.isEmpty()) {
            return last.isEmpty() ? "" : initial(last);
        }
        String name = first.length() > 40 ? first.substring(0, 40) : first;
        return last.isEmpty() ? name : name + " " + initial(last);
    }

    private static String initial(String s) {
        int cp = s.codePointAt(0);
        return new String(Character.toChars(Character.toUpperCase(cp))) + ".";
    }

    /** {@code THANKS-XXXXXX}: 6 characters of an unambiguous alphabet (~10⁹ combinations). */
    public static String bonusCode() {
        StringBuilder sb = new StringBuilder(BONUS_PREFIX);
        for (int i = 0; i < 6; i++) {
            sb.append(CODE_ALPHABET[RANDOM.nextInt(CODE_ALPHABET.length)]);
        }
        return sb.toString().toUpperCase(Locale.ROOT);
    }

    /** Is a bonus due at all with this percent setting (0 = bonuses off)? */
    public static boolean bonusEnabled(int bonusPercent) {
        return bonusPercent > 0;
    }

    /** When a bonus issued at {@code now} stops being valid. */
    public static Instant bonusExpiry(Instant now, int validDays) {
        return now.plus(Duration.ofDays(Math.max(1, validDays)));
    }

    /**
     * Is a "leave a review" reminder due for this order? Delivered at least {@code reminderDays}
     * ago (but not longer than {@link #REMINDER_WINDOW_DAYS} past that), no reminder sent yet, a
     * Telegram chat to write to, and something left to review.
     *
     * @param reminderDays 0 = reminders off
     */
    public static boolean reminderDue(OrderStatus status, Instant deliveredAt, Instant reminderSentAt,
                                      Long tgUserId, boolean hasPendingLines, Instant now, int reminderDays) {
        if (reminderDays <= 0 || status != OrderStatus.DELIVERED || deliveredAt == null
                || reminderSentAt != null || tgUserId == null || tgUserId <= 0 || !hasPendingLines) {
            return false;
        }
        Instant dueFrom = deliveredAt.plus(Duration.ofDays(reminderDays));
        Instant dueUntil = dueFrom.plus(Duration.ofDays(REMINDER_WINDOW_DAYS));
        return !now.isBefore(dueFrom) && now.isBefore(dueUntil);
    }
}
