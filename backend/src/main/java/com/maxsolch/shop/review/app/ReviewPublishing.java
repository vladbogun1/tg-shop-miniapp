package com.maxsolch.shop.review.app;

import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.review.app.ReviewDtos.Bonus;
import com.maxsolch.shop.review.domain.ProductReview;
import com.maxsolch.shop.review.domain.ReviewEvents;
import com.maxsolch.shop.review.infra.ReviewStore;
import com.maxsolch.shop.review.infra.ReviewStore.ProductInfo;
import com.maxsolch.shop.site.app.SiteRevalidator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * What follows a change in the visible reviews of a product — from the customer's own submit (no premoderation)
 * and from moderation alike: the rating aggregate, the cached copies of it, the site page, and the bonus.
 */
@Slf4j
@Component
public class ReviewPublishing {

    private final ReviewStore store;
    private final ReviewMapper mapper;
    private final ReviewBonus bonus;
    private final SiteRevalidator siteRevalidator;
    private final DomainEvents events;

    public ReviewPublishing(ReviewStore store, ReviewMapper mapper, ReviewBonus bonus,
                            SiteRevalidator siteRevalidator, DomainEvents events) {
        this.store = store;
        this.mapper = mapper;
        this.bonus = bonus;
        this.siteRevalidator = siteRevalidator;
        this.events = events;
    }

    /**
     * A review just became visible: the product rating and every cached copy of it change, and the
     * order's first published review earns the customer a personal code.
     *
     * @return the bonus issued now, or null
     */
    Bonus afterPublish(ProductReview review) {
        ratingChanged(review.getProductId());
        return bonus.issueIfFirst(review);
    }

    /** Recompute the aggregate now; drop the catalog caches after commit and rebuild the site page. */
    void ratingChanged(byte[] productId) {
        store.recomputeRating(productId);
        ProductInfo info = mapper.infoOf(productId);
        events.publish(new ReviewEvents.RatingChanged(productId));
        if (info != null && info.slug() != null) {
            try {
                siteRevalidator.revalidate(List.of("/product/" + info.slug(), "/"));
            } catch (RuntimeException e) {
                log.warn("Site revalidation after a review failed: {}", e.toString());
            }
        }
    }
}
