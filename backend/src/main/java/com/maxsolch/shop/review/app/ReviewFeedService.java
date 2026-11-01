package com.maxsolch.shop.review.app;

import com.maxsolch.shop.catalog.app.ProductBriefs;
import com.maxsolch.shop.catalog.domain.ProductBrief;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.review.app.ReviewDtos.FeedReview;
import com.maxsolch.shop.review.app.ReviewDtos.ReviewFeed;
import com.maxsolch.shop.review.domain.RatingSummary;
import com.maxsolch.shop.review.infra.ReviewStore;
import com.maxsolch.shop.review.infra.ReviewStore.Quote;
import com.maxsolch.shop.settings.app.SettingsService;
import com.maxsolch.shop.translation.app.TranslationService;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * Shop-wide review quotes for the site's home-page ribbon: the newest published reviews with a text,
 * product titles in the page language (the review texts themselves are what the customers wrote).
 * A sold-out (hidden) product keeps its reviews but the site must not link to its page; a review of a product
 * that is gone is not shown and not counted.
 */
@Service
public class ReviewFeedService {

    public static final int MAX_SIZE = 40;

    /** Pages read to fill the ribbon when reviews of deleted products are skipped on the way. */
    private static final int MAX_PAGES = 10;

    private final ReviewStore store;
    private final ProductBriefs products;
    private final SettingsService settings;
    private final TranslationService translations;

    public ReviewFeedService(ReviewStore store, ProductBriefs products, SettingsService settings,
                             TranslationService translations) {
        this.store = store;
        this.products = products;
        this.settings = settings;
        this.translations = translations;
    }

    @Transactional(readOnly = true)
    public ReviewFeed latest(int size, String lang) {
        if (!settings.get(ReviewSettings.REVIEWS_ENABLED, true)) {
            return new ReviewFeed(new ReviewDtos.Summary(null, 0, List.of(0L, 0L, 0L, 0L, 0L)), List.of());
        }
        int limit = Math.max(1, Math.min(MAX_SIZE, size <= 0 ? 24 : size));
        TranslationService.Overlay overlay = translations.overlay(lang);
        List<FeedReview> items = new ArrayList<>();
        for (int page = 0; page < MAX_PAGES && items.size() < limit; page++) {
            List<Quote> quotes = store.latestQuotes(limit, page * limit);
            Map<String, ProductBrief> briefs = products.briefs(quotes.stream().map(Quote::productId).toList());
            for (Quote q : quotes) {
                ProductBrief product = briefs.get(UuidUtil.toString(q.productId()));
                if (product != null && items.size() < limit) {
                    items.add(toDto(q, product, overlay));
                }
            }
            if (quotes.size() < limit) {
                break;
            }
        }
        return new ReviewFeed(summaryOf(shopSummary()), items);
    }

    private static FeedReview toDto(Quote q, ProductBrief product, TranslationService.Overlay overlay) {
        String title = overlay.text(TranslationEntityType.PRODUCT, UuidUtil.toString(q.productId()),
                TranslationEntityType.TITLE, product.title());
        // A hidden product has no page: no slug, the site shows the quote without a link.
        return new FeedReview(q.id(), q.author(), q.rating(), q.text(), q.publishedAt(), title,
                product.live() ? product.slug() : null, product.imageUrl());
    }

    /**
     * Average, count and 1★..5★ distribution over all published reviews — of hidden and archived products too, so
     * the site shows the same count as the admin's «Опубликованы»; avg null when none.
     */
    private RatingSummary shopSummary() {
        List<ReviewStore.ProductRatingCount> counts = store.publishedCounts();
        Map<String, ProductBrief> existing = products.briefs(counts.stream().map(ReviewStore.ProductRatingCount::productId)
                .collect(java.util.stream.Collectors.toMap(UuidUtil::toString, b -> b, (a, b) -> a)).values());
        long[] dist = new long[5];
        long[] total = {0, 0};
        for (ReviewStore.ProductRatingCount c : counts) {
            if (c.rating() >= 1 && c.rating() <= 5 && existing.containsKey(UuidUtil.toString(c.productId()))) {
                dist[c.rating() - 1] += c.count();
                total[0] += c.count();
                total[1] += (long) c.rating() * c.count();
            }
        }
        Double avg = total[0] == 0 ? null : Math.round(total[1] * 100.0 / total[0]) / 100.0;
        return new RatingSummary(avg, total[0], Arrays.stream(dist).boxed().toList());
    }

    private static ReviewDtos.Summary summaryOf(RatingSummary s) {
        return new ReviewDtos.Summary(s.avg(), s.count(), s.distribution());
    }
}
