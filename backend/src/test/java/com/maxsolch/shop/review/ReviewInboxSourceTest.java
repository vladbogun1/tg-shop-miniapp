package com.maxsolch.shop.review;

import com.maxsolch.shop.inbox.InboxDtos.Item;
import com.maxsolch.shop.inbox.InboxItemType;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/** «Внимание» → «Отзывы на модерации» rows. */
class ReviewInboxSourceTest {

    private static final Instant NOW = Instant.parse("2026-10-05T12:00:00Z");

    @Test
    void pendingReviewRow() {
        Instant created = NOW.minus(Duration.ofHours(30));
        ReviewDtos.AdminReview r = new ReviewDtos.AdminReview(42L, "PENDING", 4, "Хорошая\nмышь", "Олена К.",
                "p-id", "Мышь X", "mysh-x", null, "o-id", "abcd1234", 100L, "Олена Коваль", null, null,
                created, created.plusSeconds(60), null);

        Item it = ReviewInboxSource.row(r, NOW);

        assertThat(it.type()).isEqualTo(InboxItemType.REVIEW.name());
        assertThat(it.key()).isEqualTo("REVIEW:42");
        assertThat(it.entityId()).isEqualTo("42");
        assertThat(it.title()).isEqualTo("Мышь X");
        assertThat(it.subtitle()).isEqualTo("★★★★ · Олена К.: Хорошая мышь");
        assertThat(it.version()).isEqualTo(String.valueOf(created.plusSeconds(60).toEpochMilli()));
        assertThat(it.orderId()).isEqualTo("o-id");
        assertThat(it.productId()).isEqualTo("p-id");
        assertThat(it.overdue()).isTrue();
        assertThat(it.waitMinutes()).isEqualTo(30 * 60);
    }
}
