package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.review.ReviewDtos.ReviewPage;
import com.maxsolch.shop.review.ReviewService;
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

/** Published product reviews for the site and the Mini App (no authentication). */
@RestController
@RequestMapping("/api/public/products")
@Tag(name = "Public reviews", description = "Published product reviews and the rating summary")
public class PublicReviewController {

    private final ReviewService reviewService;

    public PublicReviewController(ReviewService reviewService) {
        this.reviewService = reviewService;
    }

    @GetMapping("/{idOrSlug}/reviews")
    @Operation(summary = "Published reviews of a product (by id or slug), newest first, with the summary")
    public ResponseEntity<ReviewPage> reviews(@PathVariable String idOrSlug,
                                              @RequestParam(defaultValue = "0") int page,
                                              @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic())
                .body(reviewService.publicPage(idOrSlug, page, size));
    }
}
