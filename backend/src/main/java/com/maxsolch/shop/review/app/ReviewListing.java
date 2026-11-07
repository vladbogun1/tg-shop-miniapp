package com.maxsolch.shop.review.app;

import com.maxsolch.shop.catalog.app.ProductBriefs;
import com.maxsolch.shop.customer.app.CustomerSearch;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.review.app.ReviewDtos.AdminPage;
import com.maxsolch.shop.review.domain.ProductReview;
import com.maxsolch.shop.review.domain.ReviewError;
import com.maxsolch.shop.review.domain.ReviewStatus;
import com.maxsolch.shop.review.infra.ProductReviewRepository;
import com.maxsolch.shop.review.infra.ReviewSpecs;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * The admin list of «Отзывы» with its filters: status, product, search, ratings, «Без ответа». The status counters of the
 * tabs are counted under every filter except the status, so the tabs add up to what the other filters let through.
 */
@Service
public class ReviewListing {

    /** What the screen asked for; blank/null parts are not filters. */
    public record Query(String status, String productId, String q, List<Integer> ratings, boolean unanswered,
                        int page, int size) {
    }

    /** A name search can match thousands of people or products: more than this are not looked at. */
    private static final int MAX_MATCHES = 500;
    private static final int MAX_QUERY = 100;
    /** «#1a2b3c4d» or the first hex characters of the order id the admin sees everywhere. */
    private static final Pattern ORDER_PREFIX = Pattern.compile("#?([0-9a-fA-F]{1,32})");
    private static final int MIN_BARE_PREFIX = 3;

    private final ProductReviewRepository reviews;
    private final ReviewMapper mapper;
    private final CustomerSearch customers;
    private final ProductBriefs products;

    public ReviewListing(ProductReviewRepository reviews, ReviewMapper mapper, CustomerSearch customers,
                         ProductBriefs products) {
        this.reviews = reviews;
        this.mapper = mapper;
        this.customers = customers;
        this.products = products;
    }

    @Transactional(readOnly = true)
    public AdminPage list(Query in) {
        ReviewStatus status = parseStatus(in.status());
        int p = Math.max(0, in.page());
        int s = Math.max(1, Math.min(100, in.size() <= 0 ? 30 : in.size()));

        Specification<ProductReview> scope = scopeOf(in);
        Specification<ProductReview> filtered = status == null ? scope : scope.and(ReviewSpecs.status(status));
        PageRequest pr = PageRequest.of(p, s, Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")));
        Page<ProductReview> found = reviews.findAll(filtered, pr);
        return new AdminPage(mapper.toAdmin(found.getContent()), p, s, found.getTotalPages(), found.getTotalElements(),
                reviews.count(scope.and(ReviewSpecs.status(ReviewStatus.PENDING))),
                reviews.count(scope.and(ReviewSpecs.status(ReviewStatus.PUBLISHED))),
                reviews.count(scope.and(ReviewSpecs.status(ReviewStatus.HIDDEN))));
    }

    /** Every filter except the status. */
    private Specification<ProductReview> scopeOf(Query in) {
        Specification<ProductReview> spec = ReviewSpecs.any();
        if (in.productId() != null && !in.productId().isBlank()) {
            spec = spec.and(ReviewSpecs.product(parseUuid(in.productId())));
        }
        List<Integer> ratings = in.ratings() == null ? List.of()
                : in.ratings().stream().filter(r -> r != null && r >= 1 && r <= 5).distinct().toList();
        if (!ratings.isEmpty()) {
            spec = spec.and(ReviewSpecs.ratingIn(ratings));
        }
        if (in.unanswered()) {
            spec = spec.and(ReviewSpecs.unanswered());
        }
        String q = in.q() == null ? "" : in.q().trim();
        if (!q.isEmpty()) {
            spec = spec.and(searchOf(q.length() > MAX_QUERY ? q.substring(0, MAX_QUERY) : q));
        }
        return spec;
    }

    private Specification<ProductReview> searchOf(String q) {
        String like = ReviewSpecs.likeOf(q);
        List<Long> userIds = customers.idsByName(like);
        List<Long> users = userIds.size() > MAX_MATCHES ? userIds.subList(0, MAX_MATCHES) : userIds;
        return ReviewSpecs.search(like, users, products.idsByTitleLike(like, MAX_MATCHES), orderPrefixOf(q));
    }

    /** Upper-case hex prefix when the query can be a short order id; null for ordinary words. */
    static String orderPrefixOf(String q) {
        var m = ORDER_PREFIX.matcher(q);
        if (!m.matches()) {
            return null;
        }
        boolean hash = q.startsWith("#");
        return hash || m.group(1).length() >= MIN_BARE_PREFIX ? m.group(1).toUpperCase(Locale.ROOT) : null;
    }

    private static ReviewStatus parseStatus(String raw) {
        if (raw == null || raw.isBlank() || "ALL".equalsIgnoreCase(raw)) {
            return null;
        }
        try {
            return ReviewStatus.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new DomainException.BadRequest(ReviewError.UNKNOWN_STATUS, raw);
        }
    }

    private static byte[] parseUuid(String id) {
        try {
            return UuidUtil.toBytes(id.trim());
        } catch (IllegalArgumentException e) {
            throw new DomainException.NotFound(ReviewError.REVIEW_NOT_FOUND);
        }
    }
}
