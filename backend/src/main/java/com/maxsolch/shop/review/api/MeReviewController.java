package com.maxsolch.shop.review.api;

import com.maxsolch.shop.review.app.ReviewDtos.Bonus;
import com.maxsolch.shop.review.app.ReviewDtos.MyReview;
import com.maxsolch.shop.review.app.ReviewDtos.PendingLine;
import com.maxsolch.shop.review.app.ReviewDtos.SubmitRequest;
import com.maxsolch.shop.review.app.ReviewDtos.SubmitResult;
import com.maxsolch.shop.review.app.MyReviews;
import com.maxsolch.shop.review.app.ReviewService;
import com.maxsolch.shop.platform.web.CurrentActor;
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
    private final MyReviews myReviews;
    private final CurrentActor actor;

    public MeReviewController(ReviewService reviewService, MyReviews myReviews, CurrentActor actor) {
        this.reviewService = reviewService;
        this.myReviews = myReviews;
        this.actor = actor;
    }

    @GetMapping("/reviews/pending")
    @Operation(summary = "Lines of my delivered orders without a review (optionally of one order)")
    public List<PendingLine> pending(@RequestParam(required = false) String orderId) {
        return reviewService.pendingLines(actor.userId(), orderId);
    }

    @PostMapping("/reviews")
    @Operation(summary = "Review a line of my delivered order (or edit my review while it is PENDING)")
    public SubmitResult submit(@RequestBody SubmitRequest req) {
        return myReviews.submit(req);
    }

    @GetMapping("/reviews")
    @Operation(summary = "My reviews with their status")
    public List<MyReview> mine() {
        return reviewService.myReviews(actor.userId());
    }

    @GetMapping("/bonuses")
    @Operation(summary = "My personal promo codes (review bonuses)")
    public List<Bonus> bonuses() {
        return reviewService.bonuses(actor.userId());
    }
}
