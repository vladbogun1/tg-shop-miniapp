package com.maxsolch.shop.review.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.review.app.ReviewDtos.AdminPage;
import com.maxsolch.shop.review.app.ReviewDtos.AdminReview;
import com.maxsolch.shop.review.domain.ProductReview;
import com.maxsolch.shop.review.domain.ReviewRules;
import com.maxsolch.shop.review.domain.ReviewStatus;
import com.maxsolch.shop.review.infra.ProductReviewRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.List;
import java.util.function.ToLongFunction;

/** Moderation queue: list, publish, hide, reply, delete. The admin screen reaches it through {@link AdminReviews}. */
@Service
public class ReviewModeration {

    private final ProductReviewRepository reviews;
    private final ReviewMapper mapper;
    private final ReviewPublishing publishing;
    private final Clock clock;

    public ReviewModeration(ProductReviewRepository reviews, ReviewMapper mapper, ReviewPublishing publishing,
                            Clock clock) {
        this.reviews = reviews;
        this.mapper = mapper;
        this.publishing = publishing;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public AdminPage adminList(String status, String productId, int page, int size) {
        ReviewStatus st = parseStatus(status);
        byte[] product = productId == null || productId.isBlank() ? null : parseUuid(productId);
        int p = Math.max(0, page);
        int s = Math.max(1, Math.min(100, size <= 0 ? 30 : size));
        PageRequest pr = PageRequest.of(p, s, Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")));
        Page<ProductReview> found;
        if (product != null && st != null) {
            found = reviews.findByProductIdAndStatus(product, st, pr);
        } else if (product != null) {
            found = reviews.findByProductId(product, pr);
        } else if (st != null) {
            found = reviews.findByStatus(st, pr);
        } else {
            found = reviews.findAll(pr);
        }
        List<AdminReview> items = mapper.toAdmin(found.getContent());
        // Tab counters in the same scope as the list: opened for one product, count that product only.
        ToLongFunction<ReviewStatus> count = product == null
                ? reviews::countByStatus
                : which -> reviews.countByProductIdAndStatus(product, which);
        return new AdminPage(items, p, s, found.getTotalPages(), found.getTotalElements(),
                count.applyAsLong(ReviewStatus.PENDING), count.applyAsLong(ReviewStatus.PUBLISHED),
                count.applyAsLong(ReviewStatus.HIDDEN));
    }

    /** Publishes (also a hidden one). The first published review of an order earns the bonus. */
    @Transactional
    public AdminReview publish(long id) {
        ProductReview r = load(id);
        if (r.getStatus() != ReviewStatus.PUBLISHED) {
            r.setStatus(ReviewStatus.PUBLISHED);
            if (r.getPublishedAt() == null) {
                r.setPublishedAt(clock.instant());
            }
            r = reviews.saveAndFlush(r);
            publishing.afterPublish(r);
        }
        return mapper.toAdmin(List.of(r)).get(0);
    }

    @Transactional
    public AdminReview hide(long id) {
        ProductReview r = load(id);
        if (r.getStatus() != ReviewStatus.HIDDEN) {
            boolean wasPublished = r.getStatus() == ReviewStatus.PUBLISHED;
            r.setStatus(ReviewStatus.HIDDEN);
            r = reviews.saveAndFlush(r);
            if (wasPublished) {
                publishing.ratingChanged(r.getProductId());
            }
        }
        return mapper.toAdmin(List.of(r)).get(0);
    }

    /** Public answer of the shop under the review; blank removes it. */
    @Transactional
    public AdminReview reply(long id, String text) {
        ProductReview r = load(id);
        String t = text == null ? "" : text.trim();
        if (t.length() > ReviewRules.MAX_REPLY) {
            throw new DomainException.BadRequest("Ответ длиннее " + ReviewRules.MAX_REPLY + " символов");
        }
        r.setAdminReply(t.isEmpty() ? null : t);
        r.setAdminReplyAt(t.isEmpty() ? null : clock.instant());
        r = reviews.saveAndFlush(r);
        if (r.getStatus() == ReviewStatus.PUBLISHED) {
            publishing.ratingChanged(r.getProductId());
        }
        return mapper.toAdmin(List.of(r)).get(0);
    }

    /** @return the deleted review (for the audit line) */
    @Transactional
    public AdminReview delete(long id) {
        ProductReview r = load(id);
        AdminReview before = mapper.toAdmin(List.of(r)).get(0);
        reviews.delete(r);
        reviews.flush();
        if (r.getStatus() == ReviewStatus.PUBLISHED) {
            publishing.ratingChanged(r.getProductId());
        }
        return before;
    }

    private ProductReview load(long id) {
        return reviews.findById(id).orElseThrow(() -> new DomainException.NotFound("отзыв не найден"));
    }

    private static ReviewStatus parseStatus(String raw) {
        if (raw == null || raw.isBlank() || "ALL".equalsIgnoreCase(raw)) {
            return null;
        }
        try {
            return ReviewStatus.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new DomainException.BadRequest("неизвестный статус: " + raw);
        }
    }

    private static byte[] parseUuid(String id) {
        try {
            return UuidUtil.toBytes(id.trim());
        } catch (IllegalArgumentException e) {
            throw new DomainException.NotFound("отзыв не найден");
        }
    }
}
