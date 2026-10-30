package com.maxsolch.shop.review.app;

import com.maxsolch.shop.platform.journal.ActivityLog;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.review.app.ReviewDtos.SubmitRequest;
import com.maxsolch.shop.review.app.ReviewDtos.SubmitResult;
import com.maxsolch.shop.review.domain.ReviewRules;
import org.springframework.stereotype.Service;

/** The customer writing a review: submits it for the current customer and leaves the «Журнал → Бот и сайт» line. */
@Service
public class MyReviews {

    private final ReviewService reviews;
    private final CurrentActor actor;
    private final ActivityLog activity;

    public MyReviews(ReviewService reviews, CurrentActor actor, ActivityLog activity) {
        this.reviews = reviews;
        this.actor = actor;
        this.activity = activity;
    }

    public SubmitResult submit(SubmitRequest req) {
        SubmitResult result;
        try {
            result = reviews.submit(actor.userId(), req);
        } catch (RuntimeException e) {
            activity.record(ActivityLog.fromRequest("REVIEW_FAILED")
                    .text("Отзыв не принят: " + e.getMessage()).rejected(e));
            throw e;
        }
        if (result != null && result.review() != null) {
            var r = result.review();
            activity.record(ActivityLog.fromRequest("REVIEW_SUBMITTED")
                    .order(r.orderId())
                    .text("Отзыв " + "★".repeat(Math.max(0, Math.min(5, r.rating()))) + " на «" + r.title() + "»"
                            + (result.bonus() != null ? " · выдан бонус −" + ReviewRules.discountRu(
                                    result.bonus().percent(), result.bonus().maxDiscountMinor()) : ""))
                    .detail("reviewId", r.id())
                    .detail("rating", r.rating())
                    .detail("status", r.status()));
        }
        return result;
    }
}
