package com.maxsolch.shop.review.infra;

import com.maxsolch.shop.review.domain.ProductReview;
import com.maxsolch.shop.review.domain.ReviewStatus;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;

/**
 * Conditions of the admin list of reviews, each one a piece that {@link Specification#and} glues together, so the
 * page and the per-status counters are built from the same filters.
 */
public final class ReviewSpecs {

    private ReviewSpecs() {
    }

    public static Specification<ProductReview> any() {
        return (root, query, cb) -> cb.conjunction();
    }

    public static Specification<ProductReview> status(ReviewStatus status) {
        return (root, query, cb) -> cb.equal(root.get("status"), status);
    }

    public static Specification<ProductReview> product(byte[] productId) {
        return (root, query, cb) -> cb.equal(root.get("productId"), productId);
    }

    /** One or several ratings (1..5). */
    public static Specification<ProductReview> ratingIn(Collection<Integer> ratings) {
        return (root, query, cb) -> root.get("rating").in(ratings);
    }

    /** No public reply of the shop yet (a blank reply is stored as null). */
    public static Specification<ProductReview> unanswered() {
        return (root, query, cb) -> cb.isNull(root.get("adminReply"));
    }

    /**
     * Free-text search: the text of the review, the name written under it, the customer (ids from the customers
     * module), the product (ids from the catalog) or the order's short id.
     *
     * @param like        the LIKE pattern of the text, from {@link #likeOf}
     * @param userIds     customers whose name or username matches
     * @param productIds  products whose title matches
     * @param orderPrefix upper-case hex prefix of the order id, or null when the query does not look like one
     */
    public static Specification<ProductReview> search(String like, Collection<Long> userIds,
                                                      Collection<byte[]> productIds, String orderPrefix) {
        return (root, query, cb) -> {
            List<Predicate> any = new ArrayList<>();
            any.add(cb.like(cb.lower(root.get("text")), like, '\\'));
            any.add(cb.like(cb.lower(root.get("authorName")), like, '\\'));
            if (!userIds.isEmpty()) {
                any.add(root.get("userId").in(userIds));
            }
            if (!productIds.isEmpty()) {
                any.add(root.get("productId").in(productIds));
            }
            if (orderPrefix != null) {
                any.add(cb.like(cb.function("hex", String.class, root.get("orderId")), orderPrefix + "%"));
            }
            return cb.or(any.toArray(Predicate[]::new));
        };
    }

    /** {@code %q%}, lower-case, with the LIKE wildcards of the query itself escaped by a backslash. */
    public static String likeOf(String q) {
        return "%" + q.trim().toLowerCase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }
}
