package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.review.ReviewDtos.ReviewFeed;
import com.maxsolch.shop.review.ReviewDtos.ReviewPage;
import com.maxsolch.shop.review.ReviewFeedService;
import com.maxsolch.shop.review.ReviewService;
import com.maxsolch.shop.translation.ContentLocale;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.Locale;

/** Published product reviews for the site and the Mini App (no authentication). */
@RestController
@RequestMapping("/api/public")
@Tag(name = "Public reviews", description = "Published product reviews and the rating summary")
public class PublicReviewController {

    private final ReviewService reviewService;
    private final ReviewFeedService feedService;

    public PublicReviewController(ReviewService reviewService, ReviewFeedService feedService) {
        this.reviewService = reviewService;
        this.feedService = feedService;
    }

    @GetMapping("/products/{idOrSlug}/reviews")
    @Operation(summary = "Published reviews of a product (by id or slug), newest first, with the summary")
    public ResponseEntity<ReviewPage> reviews(@PathVariable String idOrSlug,
                                              @RequestParam(defaultValue = "0") int page,
                                              @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic())
                .body(reviewService.publicPage(idOrSlug, page, size));
    }

    @GetMapping("/reviews/latest")
    @Operation(summary = "Newest published reviews with a text across the shop (home-page ribbon) and the "
            + "shop-wide rating summary; product titles in the request language")
    public ResponseEntity<ReviewFeed> latest(@RequestParam(defaultValue = "24") int size, Locale locale) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic())
                .body(feedService.latest(size, ContentLocale.normalize(locale)));
    }
}
