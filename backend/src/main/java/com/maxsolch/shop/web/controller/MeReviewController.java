package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.review.ReviewDtos.Bonus;
import com.maxsolch.shop.review.ReviewDtos.MyReview;
import com.maxsolch.shop.review.ReviewDtos.PendingLine;
import com.maxsolch.shop.review.ReviewDtos.SubmitRequest;
import com.maxsolch.shop.review.ReviewDtos.SubmitResult;
import com.maxsolch.shop.review.ReviewService;
import com.maxsolch.shop.web.SecurityUtil;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** The customer's reviews: what can be reviewed, writing one, my reviews and my bonus codes. */
@RestController
@RequestMapping("/api/me")
@Tag(name = "Me: reviews", description = "Customer reviews and personal bonus codes")
@SecurityRequirement(name = "bearer-jwt")
@PreAuthorize("hasRole('CUSTOMER')")
public class MeReviewController {

    private final ReviewService reviewService;

    public MeReviewController(ReviewService reviewService) {
        this.reviewService = reviewService;
    }

    @GetMapping("/reviews/pending")
    @Operation(summary = "Lines of my delivered orders without a review (optionally of one order)")
    public List<PendingLine> pending(@RequestParam(required = false) String orderId) {
        return reviewService.pendingLines(SecurityUtil.currentUserId(), orderId);
    }

    @PostMapping("/reviews")
    @Operation(summary = "Review a line of my delivered order (or edit my review while it is PENDING)")
    public SubmitResult submit(@RequestBody SubmitRequest req) {
        return reviewService.submit(SecurityUtil.currentUserId(), req);
    }

    @GetMapping("/reviews")
    @Operation(summary = "My reviews with their status")
    public List<MyReview> mine() {
        return reviewService.myReviews(SecurityUtil.currentUserId());
    }

    @GetMapping("/bonuses")
    @Operation(summary = "My personal promo codes (review bonuses)")
    public List<Bonus> bonuses() {
        return reviewService.bonuses(SecurityUtil.currentUserId());
    }
}
