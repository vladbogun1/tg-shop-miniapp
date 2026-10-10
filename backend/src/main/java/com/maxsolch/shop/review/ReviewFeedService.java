package com.maxsolch.shop.review;

import com.maxsolch.shop.review.ReviewDtos.FeedReview;
import com.maxsolch.shop.review.ReviewDtos.ReviewFeed;
import com.maxsolch.shop.review.ReviewStore.FeedRow;
import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
import com.maxsolch.shop.translation.TranslationEntityType;
import com.maxsolch.shop.translation.TranslationService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Shop-wide review quotes for the site's home-page ribbon: the newest published reviews with a text,
 * product titles in the page language (the review texts themselves are what the customers wrote).
 */
@Service
public class ReviewFeedService {

    public static final int MAX_SIZE = 40;

    private final ReviewStore store;
    private final SettingsService settings;
    private final TranslationService translations;

    public ReviewFeedService(ReviewStore store, SettingsService settings, TranslationService translations) {
        this.store = store;
        this.settings = settings;
        this.translations = translations;
    }

    @Transactional(readOnly = true)
    public ReviewFeed latest(int size, String lang) {
        if (!settings.get(SettingsRegistry.REVIEWS_ENABLED, true)) {
            return new ReviewFeed(new ReviewDtos.Summary(null, 0, List.of(0L, 0L, 0L, 0L, 0L)), List.of());
        }
        int limit = Math.max(1, Math.min(MAX_SIZE, size <= 0 ? 24 : size));
        TranslationService.Overlay overlay = translations.overlay(lang);
        List<FeedReview> items = store.latestFeed(limit).stream()
                .map(r -> toDto(r, overlay))
                .toList();
        return new ReviewFeed(store.shopSummary(), items);
    }

    private static FeedReview toDto(FeedRow r, TranslationService.Overlay overlay) {
        String title = overlay.text(TranslationEntityType.PRODUCT, r.productId(), TranslationEntityType.TITLE,
                r.productTitle());
        // A hidden product has no page: no slug, the site shows the quote without a link.
        return new FeedReview(r.id(), r.author(), r.rating(), r.text(), r.publishedAt(), title,
                r.productLive() ? r.productSlug() : null, r.imageUrl());
    }
}
