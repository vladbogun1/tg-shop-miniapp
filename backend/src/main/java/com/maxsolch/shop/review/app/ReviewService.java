package com.maxsolch.shop.review.app;

import com.maxsolch.shop.review.domain.ProductReview;
import com.maxsolch.shop.review.domain.ReviewRules;
import com.maxsolch.shop.review.infra.ReviewStore.ProductInfo;
import com.maxsolch.shop.review.domain.ReviewStatus;
import com.maxsolch.shop.review.infra.ProductReviewRepository;
import com.maxsolch.shop.review.infra.ReviewStore;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.domain.User;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.review.app.ReviewDtos.Bonus;
import com.maxsolch.shop.review.app.ReviewDtos.MyReview;
import com.maxsolch.shop.review.app.ReviewDtos.PendingLine;
import com.maxsolch.shop.review.app.ReviewDtos.PublicReview;
import com.maxsolch.shop.review.app.ReviewDtos.ReviewPage;
import com.maxsolch.shop.review.app.ReviewDtos.SubmitRequest;
import com.maxsolch.shop.review.app.ReviewDtos.SubmitResult;
import com.maxsolch.shop.review.app.ReviewDtos.Summary;
import com.maxsolch.shop.platform.settings.SettingsRegistry;
import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.order.app.OrderLines;
import com.maxsolch.shop.order.app.OrderLookup;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.review.domain.ReviewEvents;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Product reviews: who may write one (own DELIVERED order, one per line), premoderation, the
 * product rating aggregate, and the personal bonus code for the first published review of an order.
 * See docs/ORDERS-SUPPORT-REVIEWS.md, phase C.
 */
@Slf4j
@Service
public class ReviewService {

    public static final int MAX_PAGE_SIZE = 50;

    private final ProductReviewRepository reviews;
    private final OrderLookup orders;
    private final OrderLines orderLines;
    private final UserRepository users;
    private final ReviewStore store;
    private final SettingsService settings;
    private final Messages messages;
    private final ReviewMapper mapper;
    private final ReviewPublishing publishing;
    private final ReviewBonus bonus;
    private final DomainEvents events;
    private final Clock clock;

    public ReviewService(ProductReviewRepository reviews, OrderLookup orders, OrderLines orderLines,
                         UserRepository users, ReviewStore store, SettingsService settings, Messages messages,
                         ReviewMapper mapper, ReviewPublishing publishing, ReviewBonus bonus, DomainEvents events,
                         Clock clock) {
        this.reviews = reviews;
        this.orders = orders;
        this.orderLines = orderLines;
        this.users = users;
        this.store = store;
        this.settings = settings;
        this.messages = messages;
        this.mapper = mapper;
        this.publishing = publishing;
        this.bonus = bonus;
        this.events = events;
        this.clock = clock;
    }

    public boolean enabled() {
        return settings.get(SettingsRegistry.REVIEWS_ENABLED, true);
    }

    // ================================================================== public

    @Transactional(readOnly = true)
    public ReviewPage publicPage(String idOrSlug, int page, int size) {
        byte[] productId = resolveProduct(idOrSlug);
        int p = Math.max(0, page);
        int s = Math.max(1, Math.min(MAX_PAGE_SIZE, size <= 0 ? 10 : size));
        Page<ProductReview> found = reviews.findByProductIdAndStatus(productId, ReviewStatus.PUBLISHED,
                PageRequest.of(p, s, Sort.by(Sort.Order.desc("publishedAt"), Sort.Order.desc("id"))));
        Map<Long, OrderItem> lines = mapper.linesOf(found.getContent());
        List<PublicReview> items = found.getContent().stream()
                .map(r -> new PublicReview(r.getId(), r.getAuthorName(), r.getRating(), r.getText(),
                        ReviewMapper.variantOf(lines.get(r.getOrderItemId())), r.getCreatedAt(), r.getPublishedAt(),
                        r.getAdminReply(), r.getAdminReplyAt()))
                .toList();
        return new ReviewPage(UuidUtil.toString(productId), summary(productId), items, p, s,
                found.getTotalPages(), found.getTotalElements());
    }

    /** Average, count and the 1★..5★ distribution of the published reviews. */
    @Transactional(readOnly = true)
    public Summary summary(byte[] productId) {
        long[] dist = new long[5];
        long count = 0;
        long sum = 0;
        for (Object[] row : reviews.distribution(productId)) {
            int rating = ((Number) row[0]).intValue();
            long n = ((Number) row[1]).longValue();
            if (rating >= 1 && rating <= 5) {
                dist[rating - 1] += n;
                count += n;
                sum += (long) rating * n;
            }
        }
        Double avg = count == 0 ? null : Math.round(sum * 100.0 / count) / 100.0;
        return new Summary(avg, count, Arrays.stream(dist).boxed().toList());
    }

    private byte[] resolveProduct(String idOrSlug) {
        if (idOrSlug == null || idOrSlug.isBlank()) {
            throw new DomainException.NotFound(messages.current("api.product.notFound"));
        }
        String key = idOrSlug.trim();
        if (key.length() == 36) {
            try {
                return UuidUtil.toBytes(key);
            } catch (IllegalArgumentException ignored) {
                // a slug that happens to be 36 characters long
            }
        }
        return store.productIdBySlug(key).orElseThrow(() -> new DomainException.NotFound(messages.current("api.product.notFound")));
    }

    // ================================================================== customer

    /** Lines of my delivered orders without a review yet; {@code orderId} narrows to one order. */
    @Transactional(readOnly = true)
    public List<PendingLine> pendingLines(long userId, String orderId) {
        if (!enabled()) {
            return List.of();
        }
        byte[] only = orderId == null || orderId.isBlank() ? null : parseUuid(orderId);
        List<Order> delivered = orders.ofUser(userId).stream()
                .filter(o -> o.getStatus() == OrderStatus.DELIVERED)
                .filter(o -> only == null || Arrays.equals(o.getId(), only))
                .toList();
        List<OrderItem> candidates = new ArrayList<>();
        for (Order o : delivered) {
            for (OrderItem i : o.getItems()) {
                if (ReviewRules.isReviewableLine(i)) {
                    candidates.add(i);
                }
            }
        }
        if (candidates.isEmpty()) {
            return List.of();
        }
        Set<Long> reviewed = new HashSet<>(reviews.reviewedItemIds(
                candidates.stream().map(OrderItem::getId).toList()));
        Map<String, ProductInfo> infos = store.productInfos(candidates.stream().map(OrderItem::getProductId).toList());
        List<PendingLine> out = new ArrayList<>();
        for (OrderItem i : candidates) {
            if (reviewed.contains(i.getId())) {
                continue;
            }
            ProductInfo info = infos.get(UuidUtil.toString(i.getProductId()));
            Order o = i.getOrder();
            out.add(new PendingLine(i.getId(), UuidUtil.toString(o.getId()), UuidUtil.toString(i.getProductId()),
                    info == null ? null : info.slug(), ReviewMapper.titleOf(i, info), i.getVariantNameSnapshot(),
                    info == null ? null : info.imageUrl(), o.getDeliveredAt()));
        }
        return out;
    }

    /**
     * Writes a review of one of my order lines — or edits my own review while it is still PENDING.
     * With premoderation off the review is published at once (and may earn the bonus).
     */
    @Transactional
    public SubmitResult submit(long userId, SubmitRequest req) {
        if (!enabled()) {
            throw new DomainException.BadRequest(messages.current("api.review.disabled"));
        }
        if (req == null || req.orderItemId() == null) {
            throw new DomainException.BadRequest(messages.current("api.review.notReviewable"));
        }
        int rating = req.rating() == null ? 0 : req.rating();
        String text = req.text() == null ? "" : req.text().trim();

        Optional<ProductReview> existing = reviews.findByOrderItemId(req.orderItemId());
        if (existing.isPresent()) {
            ProductReview own = existing.get();
            if (own.getUserId() == null || own.getUserId() != userId) {
                throw new DomainException.BadRequest(messages.current("api.review.already"));
            }
            if (own.getStatus() != ReviewStatus.PENDING) {
                throw new DomainException.BadRequest(messages.current("api.review.notEditable"));
            }
            validate(rating, text);
            own.setRating(rating);
            own.setText(text);
            ProductReview saved = reviews.saveAndFlush(own);
            OrderItem line = orderLines.find(req.orderItemId()).orElse(null);
            return new SubmitResult(mapper.toMine(saved, line, mapper.infoOf(saved.getProductId())), null);
        }

        OrderItem item = orderLines.find(req.orderItemId())
                .orElseThrow(() -> new DomainException.BadRequest(messages.current("api.review.notYours")));
        Order order = item.getOrder();
        ReviewRules.Eligibility eligibility = ReviewRules.eligibility(order, item, userId, false);
        if (eligibility != ReviewRules.Eligibility.OK) {
            throw new DomainException.BadRequest(messages.current(eligibility.messageKey()));
        }
        validate(rating, text);
        int maxPerDay = settings.get(SettingsRegistry.REVIEWS_MAX_PER_DAY, 10);
        Instant now = clock.instant();
        if (maxPerDay > 0 && reviews.countByUserIdAndCreatedAtAfter(userId, now.minus(Duration.ofDays(1))) >= maxPerDay) {
            throw new DomainException.BadRequest(messages.current("api.review.tooMany", maxPerDay));
        }

        ProductReview review = new ProductReview();
        review.setProductId(item.getProductId());
        review.setOrderId(order.getId());
        review.setOrderItemId(item.getId());
        review.setUserId(userId);
        review.setTgUserId(order.getTgUserId() != null ? order.getTgUserId() : userId);
        User user = users.findById(userId).orElse(null);
        review.setAuthorName(user == null ? "" : ReviewRules.authorName(user.getFirstName(), user.getLastName()));
        review.setRating(rating);
        review.setText(text);
        review.setCreatedAt(now);
        ReviewStatus status = ReviewRules.initialStatus(settings.get(SettingsRegistry.REVIEWS_PREMODERATION, true));
        review.setStatus(status);
        if (status == ReviewStatus.PUBLISHED) {
            review.setPublishedAt(now);
        }
        ProductReview saved;
        try {
            saved = reviews.saveAndFlush(review);
        } catch (DataIntegrityViolationException e) {
            // Two taps at once: the unique order_item_id let only one through.
            throw new DomainException.BadRequest(messages.current("api.review.already"));
        }

        Bonus issued = null;
        if (status == ReviewStatus.PUBLISHED) {
            issued = publishing.afterPublish(saved);
        } else {
            String title = item.getTitleSnapshot();
            long pending = reviews.countByStatus(ReviewStatus.PENDING);
            events.publish(new ReviewEvents.PendingForModeration(title, rating, pending));
        }
        return new SubmitResult(mapper.toMine(saved, item, mapper.infoOf(saved.getProductId())), issued);
    }

    private void validate(int rating, String text) {
        if (!ReviewRules.validRating(rating)) {
            throw new DomainException.BadRequest(messages.current("api.review.rating"));
        }
        int minLength = settings.get(SettingsRegistry.REVIEWS_MIN_LENGTH, 10);
        String problem = ReviewRules.textProblem(text, minLength);
        if (problem != null) {
            throw new DomainException.BadRequest("api.review.tooShort".equals(problem)
                    ? messages.current(problem, Math.max(1, minLength))
                    : messages.current(problem, ReviewRules.MAX_TEXT));
        }
    }

    @Transactional(readOnly = true)
    public List<MyReview> myReviews(long userId) {
        return mapper.toMine(reviews.findByUserIdOrderByCreatedAtDesc(userId));
    }

    /** My personal promo codes (review bonuses), newest first. */
    public List<Bonus> bonuses(long userId) {
        return bonus.bonuses(userId);
    }

    private static byte[] parseUuid(String id) {
        try {
            return UuidUtil.toBytes(id.trim());
        } catch (IllegalArgumentException e) {
            throw new DomainException.NotFound("отзыв не найден");
        }
    }
}
