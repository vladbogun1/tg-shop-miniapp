package com.maxsolch.shop.review;

import com.maxsolch.shop.review.ReviewDtos.ReviewFeed;
import com.maxsolch.shop.review.ReviewDtos.Summary;
import com.maxsolch.shop.review.ReviewStore.FeedRow;
import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
import com.maxsolch.shop.translation.TranslationEntityType;
import com.maxsolch.shop.translation.TranslationOrigin;
import com.maxsolch.shop.translation.TranslationService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReviewFeedServiceTest {

    private static final String PID = "11111111-2222-3333-4444-555555555555";

    @Mock
    ReviewStore store;
    @Mock
    SettingsService settings;
    @Mock
    TranslationService translations;

    private ReviewFeedService service() {
        return new ReviewFeedService(store, settings, translations);
    }

    private static FeedRow row(String title) {
        return row(title, true);
    }

    private static FeedRow row(String title, boolean live) {
        return new FeedRow(7, "Олена К.", 5, "Топ", Instant.parse("2026-10-01T10:00:00Z"), PID, title, "mouse",
                "https://img/1.jpg", live);
    }

    @Test
    void reviewOfAHiddenProductStaysButIsNotLinked() {
        when(settings.get(SettingsRegistry.REVIEWS_ENABLED, true)).thenReturn(true);
        when(translations.overlay("ru")).thenReturn(new TranslationService.Overlay(Map.of()));
        when(store.latestFeed(24)).thenReturn(List.of(row("Мышка", false)));
        when(store.shopSummary()).thenReturn(new Summary(5.0, 1, List.of(0L, 0L, 0L, 0L, 1L)));

        ReviewFeed feed = service().latest(24, "ru");

        assertThat(feed.items()).singleElement().satisfies(r -> {
            assertThat(r.productTitle()).isEqualTo("Мышка");
            assertThat(r.productSlug()).isNull();
        });
    }

    @Test
    void disabledReviewsGiveAnEmptyRibbon() {
        when(settings.get(SettingsRegistry.REVIEWS_ENABLED, true)).thenReturn(false);
        ReviewFeed feed = service().latest(24, "uk");
        assertThat(feed.items()).isEmpty();
        assertThat(feed.summary().count()).isZero();
        verify(store, never()).latestFeed(anyInt());
    }

    @Test
    void sizeIsClampedAndTitlesAreTranslatedWhenCurrent() {
        when(settings.get(SettingsRegistry.REVIEWS_ENABLED, true)).thenReturn(true);
        String source = "Мышка";
        when(translations.overlay("uk")).thenReturn(new TranslationService.Overlay(Map.of(
                new TranslationService.Key(TranslationEntityType.PRODUCT, PID, TranslationEntityType.TITLE),
                new TranslationService.Entry("Мишка", TranslationService.sha256Hex(source), TranslationOrigin.values()[0]))));
        when(store.latestFeed(ReviewFeedService.MAX_SIZE)).thenReturn(List.of(row(source)));
        when(store.shopSummary()).thenReturn(new Summary(5.0, 1, List.of(0L, 0L, 0L, 0L, 1L)));

        ReviewFeed feed = service().latest(1000, "uk");

        assertThat(feed.items()).singleElement().satisfies(r -> {
            assertThat(r.productTitle()).isEqualTo("Мишка");
            assertThat(r.productSlug()).isEqualTo("mouse");
            assertThat(r.rating()).isEqualTo(5);
        });
        assertThat(feed.summary().avg()).isEqualTo(5.0);
    }
}
