package com.maxsolch.shop.review;

import com.maxsolch.shop.inbox.InboxDtos.Item;
import com.maxsolch.shop.inbox.InboxExtraSource;
import com.maxsolch.shop.inbox.InboxItemType;
import com.maxsolch.shop.inbox.InboxMark;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * «Внимание» → «Отзывы на модерации»: one row per PENDING review. The row leaves once an admin
 * publishes, hides or deletes it; an edit by the customer brings a snoozed row back (the version
 * is the time of the last change).
 */
@Component
public class ReviewInboxSource implements InboxExtraSource {

    /** A review waiting longer than this is shown as overdue. */
    static final Duration OVERDUE = Duration.ofHours(24);
    private static final int LIMIT = 100;

    private final ReviewService reviews;

    public ReviewInboxSource(ReviewService reviews) {
        this.reviews = reviews;
    }

    @Override
    public List<Item> items(Instant now) {
        return reviews.adminList(ReviewStatus.PENDING.name(), null, 0, LIMIT).items().stream()
                .map(r -> row(r, now))
                .toList();
    }

    static Item row(ReviewDtos.AdminReview r, Instant now) {
        String id = String.valueOf(r.id());
        String title = r.productTitle() == null || r.productTitle().isBlank() ? "Товар" : r.productTitle();
        String who = r.author() == null || r.author().isBlank() ? "Покупатель" : r.author();
        String text = r.text() == null ? "" : r.text();
        String subtitle = shorten("★".repeat(Math.max(1, Math.min(5, r.rating()))) + " · " + who + ": " + text, 160);
        Instant since = r.createdAt();
        Instant changed = r.updatedAt() != null ? r.updatedAt() : since;
        long wait = since == null ? 0 : Math.max(0, Duration.between(since, now).toMinutes());
        boolean overdue = since != null && Duration.between(since, now).compareTo(OVERDUE) >= 0;
        return new Item(InboxMark.key(InboxItemType.REVIEW, id), InboxItemType.REVIEW.name(), id,
                changed == null ? "0" : String.valueOf(changed.toEpochMilli()), title, subtitle,
                r.orderId(), r.orderShortId(), r.status(), null, null, r.productId(), null, null, null, null,
                since, wait, overdue);
    }

    private static String shorten(String s, int max) {
        String flat = s.replaceAll("\\s+", " ").trim();
        return flat.length() <= max ? flat : flat.substring(0, max - 1) + "…";
    }
}
