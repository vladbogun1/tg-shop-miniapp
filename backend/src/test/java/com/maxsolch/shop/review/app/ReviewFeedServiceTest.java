package com.maxsolch.shop.review.app;

import com.maxsolch.shop.catalog.app.ProductBriefs;
import com.maxsolch.shop.catalog.domain.ProductBrief;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.review.app.ReviewDtos.ReviewFeed;
import com.maxsolch.shop.review.infra.ReviewStore;
import com.maxsolch.shop.review.infra.ReviewStore.ProductRatingCount;
import com.maxsolch.shop.review.infra.ReviewStore.Quote;
import com.maxsolch.shop.settings.app.SettingsService;
import com.maxsolch.shop.translation.app.TranslationService;
import com.maxsolch.shop.translation.domain.SourceHash;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import com.maxsolch.shop.translation.domain.TranslationOrigin;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReviewFeedServiceTest {

    private static final String PID = "11111111-2222-3333-4444-555555555555";
    private static final byte[] PRODUCT = UuidUtil.toBytes(UUID.fromString(PID));

    @Mock
    ReviewStore store;
    @Mock
    ProductBriefs products;
    @Mock
    SettingsService settings;
    @Mock
    TranslationService translations;

    private ReviewFeedService service() {
        return new ReviewFeedService(store, products, settings, translations);
    }

    private static Quote quote() {
        return new Quote(7, "Олена К.", 5, "Топ", Instant.parse("2026-10-01T10:00:00Z"), PRODUCT);
    }

    private void oneFiveStarReviewOf(ProductBrief brief) {
        when(store.publishedCounts()).thenReturn(List.of(new ProductRatingCount(PRODUCT, 5, 1)));
        when(products.briefs(any())).thenReturn(brief == null ? Map.of() : Map.of(PID, brief));
    }

    @Test
    void reviewOfAHiddenProductStaysButIsNotLinked() {
        when(settings.get(ReviewSettings.REVIEWS_ENABLED, true)).thenReturn(true);
        when(translations.overlay("ru")).thenReturn(new TranslationService.Overlay(Map.of()));
        when(store.latestQuotes(24, 0)).thenReturn(List.of(quote()));
        oneFiveStarReviewOf(new ProductBrief("Мышка", "mouse", "https://img/1.jpg", false));

        ReviewFeed feed = service().latest(24, "ru");

        assertThat(feed.items()).singleElement().satisfies(r -> {
            assertThat(r.productTitle()).isEqualTo("Мышка");
            assertThat(r.productSlug()).isNull();
        });
        assertThat(feed.summary().count()).isEqualTo(1);
    }

    @Test
    void reviewOfADeletedProductIsNeitherShownNorCounted() {
        when(settings.get(ReviewSettings.REVIEWS_ENABLED, true)).thenReturn(true);
        when(translations.overlay("ru")).thenReturn(new TranslationService.Overlay(Map.of()));
        when(store.latestQuotes(24, 0)).thenReturn(List.of(quote()));
        oneFiveStarReviewOf(null);

        ReviewFeed feed = service().latest(24, "ru");

        assertThat(feed.items()).isEmpty();
        assertThat(feed.summary().count()).isZero();
        assertThat(feed.summary().avg()).isNull();
    }

    @Test
    void disabledReviewsGiveAnEmptyRibbon() {
        when(settings.get(ReviewSettings.REVIEWS_ENABLED, true)).thenReturn(false);
        ReviewFeed feed = service().latest(24, "uk");
        assertThat(feed.items()).isEmpty();
        assertThat(feed.summary().count()).isZero();
        verify(store, never()).latestQuotes(anyInt(), anyInt());
    }

    @Test
    void sizeIsClampedAndTitlesAreTranslatedWhenCurrent() {
        when(settings.get(ReviewSettings.REVIEWS_ENABLED, true)).thenReturn(true);
        String source = "Мышка";
        when(translations.overlay("uk")).thenReturn(new TranslationService.Overlay(Map.of(
                new TranslationService.Key(TranslationEntityType.PRODUCT, PID, TranslationEntityType.TITLE),
                new TranslationService.Entry("Мишка", SourceHash.sha256Hex(source), TranslationOrigin.values()[0]))));
        when(store.latestQuotes(ReviewFeedService.MAX_SIZE, 0)).thenReturn(List.of(quote()));
        oneFiveStarReviewOf(new ProductBrief(source, "mouse", "https://img/1.jpg", true));

        ReviewFeed feed = service().latest(1000, "uk");

        assertThat(feed.items()).singleElement().satisfies(r -> {
            assertThat(r.productTitle()).isEqualTo("Мишка");
            assertThat(r.productSlug()).isEqualTo("mouse");
            assertThat(r.rating()).isEqualTo(5);
        });
        assertThat(feed.summary().avg()).isEqualTo(5.0);
    }
}
