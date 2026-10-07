package com.maxsolch.shop.review;

import com.maxsolch.shop.common.AfterCommit;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.domain.PromoCode;
import com.maxsolch.shop.domain.User;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.repository.OrderItemRepository;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.repository.PromoCodeRepository;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.review.ReviewDtos.AdminPage;
import com.maxsolch.shop.review.ReviewDtos.AdminReview;
import com.maxsolch.shop.review.ReviewDtos.Bonus;
import com.maxsolch.shop.review.ReviewDtos.MyReview;
import com.maxsolch.shop.review.ReviewDtos.PendingLine;
import com.maxsolch.shop.review.ReviewDtos.PublicReview;
import com.maxsolch.shop.review.ReviewDtos.ReviewPage;
import com.maxsolch.shop.review.ReviewDtos.SubmitRequest;
import com.maxsolch.shop.review.ReviewDtos.SubmitResult;
import com.maxsolch.shop.review.ReviewDtos.Summary;
import com.maxsolch.shop.review.ReviewStore.ProductInfo;
import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
import com.maxsolch.shop.site.SiteRevalidator;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.NotFoundException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
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
    private final OrderItemRepository orderItems;
    private final OrderRepository orders;
    private final UserRepository users;
    private final PromoCodeRepository promoCodes;
    private final ReviewStore store;
    private final SettingsService settings;
    private final Messages messages;
    private final ReviewNotifier notifier;
    private final CacheManager cacheManager;
    private final SiteRevalidator siteRevalidator;
    private Clock clock = Clock.systemUTC();

    public ReviewService(ProductReviewRepository reviews, OrderItemRepository orderItems, OrderRepository orders,
                         UserRepository users, PromoCodeRepository promoCodes, ReviewStore store,
                         SettingsService settings, Messages messages, ReviewNotifier notifier,
                         CacheManager cacheManager, SiteRevalidator siteRevalidator) {
        this.reviews = reviews;
        this.orderItems = orderItems;
        this.orders = orders;
        this.users = users;
        this.promoCodes = promoCodes;
        this.store = store;
        this.settings = settings;
        this.messages = messages;
        this.notifier = notifier;
        this.cacheManager = cacheManager;
        this.siteRevalidator = siteRevalidator;
    }

    /** Tests pin the time. */
    void setClock(Clock clock) {
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
        Map<Long, OrderItem> lines = linesOf(found.getContent());
        List<PublicReview> items = found.getContent().stream()
                .map(r -> new PublicReview(r.getId(), r.getAuthorName(), r.getRating(), r.getText(),
                        variantOf(lines.get(r.getOrderItemId())), r.getCreatedAt(), r.getPublishedAt(),
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
            throw new NotFoundException(messages.current("api.product.notFound"));
        }
        String key = idOrSlug.trim();
        if (key.length() == 36) {
            try {
                return UuidUtil.toBytes(key);
            } catch (IllegalArgumentException ignored) {
                // a slug that happens to be 36 characters long
            }
        }
        return store.productIdBySlug(key).orElseThrow(() -> new NotFoundException(messages.current("api.product.notFound")));
    }

    // ================================================================== customer

    /** Lines of my delivered orders without a review yet; {@code orderId} narrows to one order. */
    @Transactional(readOnly = true)
    public List<PendingLine> pendingLines(long userId, String orderId) {
        if (!enabled()) {
            return List.of();
        }
        byte[] only = orderId == null || orderId.isBlank() ? null : parseUuid(orderId);
        List<Order> delivered = orders.findByUserIdOrderByCreatedAtDesc(userId).stream()
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
        Map<String, ProductInfo> infos = store.productInfos(
                candidates.stream().map(OrderItem::getProductId).toList());
        List<PendingLine> out = new ArrayList<>();
        for (OrderItem i : candidates) {
            if (reviewed.contains(i.getId())) {
                continue;
            }
            ProductInfo info = infos.get(UuidUtil.toString(i.getProductId()));
            Order o = i.getOrder();
            out.add(new PendingLine(i.getId(), UuidUtil.toString(o.getId()), UuidUtil.toString(i.getProductId()),
                    info == null ? null : info.slug(), titleOf(i, info), i.getVariantNameSnapshot(),
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
            throw new BadRequestException(messages.current("api.review.disabled"));
        }
        if (req == null || req.orderItemId() == null) {
            throw new BadRequestException(messages.current("api.review.notReviewable"));
        }
        int rating = req.rating() == null ? 0 : req.rating();
        String text = req.text() == null ? "" : req.text().trim();

        Optional<ProductReview> existing = reviews.findByOrderItemId(req.orderItemId());
        if (existing.isPresent()) {
            ProductReview own = existing.get();
            if (own.getUserId() == null || own.getUserId() != userId) {
                throw new BadRequestException(messages.current("api.review.already"));
            }
            if (own.getStatus() != ReviewStatus.PENDING) {
                throw new BadRequestException(messages.current("api.review.notEditable"));
            }
            validate(rating, text);
            own.setRating(rating);
            own.setText(text);
            ProductReview saved = reviews.saveAndFlush(own);
            OrderItem line = orderItems.findById(req.orderItemId()).orElse(null);
            return new SubmitResult(toMine(saved, line, infoOf(saved.getProductId())), null);
        }

        OrderItem item = orderItems.findById(req.orderItemId())
                .orElseThrow(() -> new BadRequestException(messages.current("api.review.notYours")));
        Order order = item.getOrder();
        ReviewRules.Eligibility eligibility = ReviewRules.eligibility(order, item, userId, false);
        if (eligibility != ReviewRules.Eligibility.OK) {
            throw new BadRequestException(messages.current(eligibility.messageKey()));
        }
        validate(rating, text);
        int maxPerDay = settings.get(SettingsRegistry.REVIEWS_MAX_PER_DAY, 10);
        Instant now = clock.instant();
        if (maxPerDay > 0 && reviews.countByUserIdAndCreatedAtAfter(userId, now.minus(Duration.ofDays(1))) >= maxPerDay) {
            throw new BadRequestException(messages.current("api.review.tooMany", maxPerDay));
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
            throw new BadRequestException(messages.current("api.review.already"));
        }

        Bonus bonus = null;
        if (status == ReviewStatus.PUBLISHED) {
            bonus = afterPublish(saved);
        } else {
            String title = item.getTitleSnapshot();
            long pending = reviews.countByStatus(ReviewStatus.PENDING);
            AfterCommit.run(() -> notifier.pendingForModeration(title, rating, pending));
        }
        return new SubmitResult(toMine(saved, item, infoOf(saved.getProductId())), bonus);
    }

    private void validate(int rating, String text) {
        if (!ReviewRules.validRating(rating)) {
            throw new BadRequestException(messages.current("api.review.rating"));
        }
        int minLength = settings.get(SettingsRegistry.REVIEWS_MIN_LENGTH, 10);
        String problem = ReviewRules.textProblem(text, minLength);
        if (problem != null) {
            throw new BadRequestException("api.review.tooShort".equals(problem)
                    ? messages.current(problem, Math.max(1, minLength))
                    : messages.current(problem, ReviewRules.MAX_TEXT));
        }
    }

    @Transactional(readOnly = true)
    public List<MyReview> myReviews(long userId) {
        List<ProductReview> mine = reviews.findByUserIdOrderByCreatedAtDesc(userId);
        Map<Long, OrderItem> lines = linesOf(mine);
        Map<String, ProductInfo> infos = store.productInfos(mine.stream().map(ProductReview::getProductId).toList());
        return mine.stream()
                .map(r -> toMine(r, lines.get(r.getOrderItemId()), infos.get(UuidUtil.toString(r.getProductId()))))
                .toList();
    }

    /** My personal promo codes (review bonuses), newest first. */
    @Transactional(readOnly = true)
    public List<Bonus> bonuses(long userId) {
        Instant now = clock.instant();
        return promoCodes.findByOwnerUserIdOrderByCreatedAtDesc(userId).stream()
                .map(p -> toBonus(p, now))
                .toList();
    }

    static Bonus toBonus(PromoCode p, Instant now) {
        String state;
        if (p.getMaxUses() != null && p.getUsesCount() >= p.getMaxUses()) {
            state = "USED";
        } else if (!p.isActive() || p.isExpiredAt(now)) {
            state = "EXPIRED";
        } else {
            state = "ACTIVE";
        }
        return new Bonus(p.getCode(), p.getDiscountPercent(), p.getExpiresAt(), state,
                p.getSourceOrderId() == null ? null : UuidUtil.toString(p.getSourceOrderId()),
                p.getCreatedAt());
    }

    // ================================================================== admin

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
        List<AdminReview> items = toAdmin(found.getContent());
        return new AdminPage(items, p, s, found.getTotalPages(), found.getTotalElements(),
                reviews.countByStatus(ReviewStatus.PENDING), reviews.countByStatus(ReviewStatus.PUBLISHED),
                reviews.countByStatus(ReviewStatus.HIDDEN));
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
            afterPublish(r);
        }
        return toAdmin(List.of(r)).get(0);
    }

    @Transactional
    public AdminReview hide(long id) {
        ProductReview r = load(id);
        if (r.getStatus() != ReviewStatus.HIDDEN) {
            boolean wasPublished = r.getStatus() == ReviewStatus.PUBLISHED;
            r.setStatus(ReviewStatus.HIDDEN);
            r = reviews.saveAndFlush(r);
            if (wasPublished) {
                ratingChanged(r.getProductId());
            }
        }
        return toAdmin(List.of(r)).get(0);
    }

    /** Public answer of the shop under the review; blank removes it. */
    @Transactional
    public AdminReview reply(long id, String text) {
        ProductReview r = load(id);
        String t = text == null ? "" : text.trim();
        if (t.length() > ReviewRules.MAX_REPLY) {
            throw new BadRequestException("Ответ длиннее " + ReviewRules.MAX_REPLY + " символов");
        }
        r.setAdminReply(t.isEmpty() ? null : t);
        r.setAdminReplyAt(t.isEmpty() ? null : clock.instant());
        r = reviews.saveAndFlush(r);
        if (r.getStatus() == ReviewStatus.PUBLISHED) {
            ratingChanged(r.getProductId());
        }
        return toAdmin(List.of(r)).get(0);
    }

    /** @return the deleted review (for the audit line) */
    @Transactional
    public AdminReview delete(long id) {
        ProductReview r = load(id);
        AdminReview before = toAdmin(List.of(r)).get(0);
        reviews.delete(r);
        reviews.flush();
        if (r.getStatus() == ReviewStatus.PUBLISHED) {
            ratingChanged(r.getProductId());
        }
        return before;
    }

    private ProductReview load(long id) {
        return reviews.findById(id).orElseThrow(() -> new NotFoundException("review not found"));
    }

    // ================================================================== publish side effects

    /**
     * A review just became visible: the product rating and every cached copy of it change, and the
     * order's first published review earns the customer a personal code.
     *
     * @return the bonus issued now, or null
     */
    Bonus afterPublish(ProductReview review) {
        ratingChanged(review.getProductId());
        return issueBonusIfFirst(review);
    }

    /**
     * Issues the review bonus of the review's order — once per order (an atomic flag on the order),
     * personal (owner = the author), single use, valid {@code reviews.bonusValidDays}.
     */
    Bonus issueBonusIfFirst(ProductReview review) {
        int percent = settings.get(SettingsRegistry.REVIEWS_BONUS_PERCENT, 5);
        if (!ReviewRules.bonusEnabled(percent) || review.getOrderId() == null) {
            return null;
        }
        Instant now = clock.instant();
        if (!store.claimBonus(review.getOrderId(), now)) {
            return null;
        }
        PromoCode promo = new PromoCode();
        promo.setCode(uniqueCode());
        promo.setDiscountPercent(Math.min(100, percent));
        promo.setDiscountAmountMinor(0);
        promo.setMaxUses(1);
        promo.setUsesCount(0);
        promo.setActive(true);
        promo.setOwnerUserId(review.getUserId());
        promo.setExpiresAt(ReviewRules.bonusExpiry(now, settings.get(SettingsRegistry.REVIEWS_BONUS_VALID_DAYS, 60)));
        promo.setSource(PromoCode.SOURCE_REVIEW_BONUS);
        promo.setSourceOrderId(review.getOrderId());
        PromoCode saved = promoCodes.save(promo);
        Long chat = review.getTgUserId() != null ? review.getTgUserId() : review.getUserId();
        String code = saved.getCode();
        int pc = saved.getDiscountPercent();
        Instant expires = saved.getExpiresAt();
        AfterCommit.run(() -> notifier.bonusIssued(chat, code, pc, expires));
        log.info("Review bonus {} issued to {} for order {}", code, review.getUserId(),
                UuidUtil.toString(review.getOrderId()));
        return new Bonus(code, pc, expires, "ACTIVE", UuidUtil.toString(review.getOrderId()), now);
    }

    private String uniqueCode() {
        for (int attempt = 0; attempt < 20; attempt++) {
            String code = ReviewRules.bonusCode();
            if (promoCodes.findByCode(code).isEmpty()) {
                return code;
            }
        }
        throw new IllegalStateException("could not generate a unique bonus code");
    }

    /** Recompute the aggregate now; drop the catalog caches and rebuild the site page after commit. */
    private void ratingChanged(byte[] productId) {
        store.recomputeRating(productId);
        ProductInfo info = infoOf(productId);
        AfterCommit.run(() -> {
            clear("products");
            clear("productById");
        });
        if (info != null && info.slug() != null) {
            try {
                siteRevalidator.revalidate(List.of("/product/" + info.slug()));
            } catch (RuntimeException e) {
                log.warn("Site revalidation after a review failed: {}", e.toString());
            }
        }
    }

    private void clear(String cacheName) {
        Cache cache = cacheManager.getCache(cacheName);
        if (cache != null) {
            cache.clear();
        }
    }

    // ================================================================== mapping

    private ProductInfo infoOf(byte[] productId) {
        return store.productInfos(List.of(productId)).get(UuidUtil.toString(productId));
    }

    private Map<Long, OrderItem> linesOf(List<ProductReview> list) {
        Set<Long> ids = list.stream().map(ProductReview::getOrderItemId)
                .filter(java.util.Objects::nonNull).collect(Collectors.toCollection(LinkedHashSet::new));
        if (ids.isEmpty()) {
            return new HashMap<>(); // a null orderItemId (order deleted) is looked up too — no Map.of()
        }
        return orderItems.findAllById(ids).stream().collect(Collectors.toMap(OrderItem::getId, Function.identity()));
    }

    private static String variantOf(OrderItem line) {
        return line == null ? null : line.getVariantNameSnapshot();
    }

    private static String titleOf(OrderItem line, ProductInfo info) {
        if (info != null && info.title() != null) {
            return info.title();
        }
        return line == null ? null : line.getTitleSnapshot();
    }

    private MyReview toMine(ProductReview r, OrderItem line, ProductInfo info) {
        return new MyReview(r.getId(), r.getOrderItemId() == null ? 0 : r.getOrderItemId(),
                r.getOrderId() == null ? null : UuidUtil.toString(r.getOrderId()),
                UuidUtil.toString(r.getProductId()), info == null ? null : info.slug(), titleOf(line, info),
                variantOf(line), info == null ? null : info.imageUrl(), r.getRating(), r.getText(),
                r.getStatus().name(), r.getStatus() == ReviewStatus.PENDING, r.getAdminReply(),
                r.getCreatedAt(), r.getPublishedAt());
    }

    private List<AdminReview> toAdmin(List<ProductReview> list) {
        if (list.isEmpty()) {
            return List.of();
        }
        Map<Long, OrderItem> lines = linesOf(list);
        Map<String, ProductInfo> infos = store.productInfos(list.stream().map(ProductReview::getProductId).toList());
        Map<Long, User> people = new HashMap<>();
        users.findAllById(list.stream().map(ProductReview::getUserId).collect(Collectors.toSet()))
                .forEach(u -> people.put(u.getTelegramUserId(), u));
        return list.stream().map(r -> {
            OrderItem line = lines.get(r.getOrderItemId());
            ProductInfo info = infos.get(UuidUtil.toString(r.getProductId()));
            User u = people.get(r.getUserId());
            return new AdminReview(r.getId(), r.getStatus().name(), r.getRating(), r.getText(), r.getAuthorName(),
                    UuidUtil.toString(r.getProductId()), titleOf(line, info), info == null ? null : info.slug(),
                    variantOf(line), r.getOrderId() == null ? null : UuidUtil.toString(r.getOrderId()),
                    ReviewStore.shortId(r.getOrderId()), r.getUserId(), customerName(u), r.getAdminReply(),
                    r.getAdminReplyAt(), r.getCreatedAt(), r.getUpdatedAt(), r.getPublishedAt());
        }).toList();
    }

    private static String customerName(User u) {
        if (u == null) {
            return null;
        }
        String name = ((u.getFirstName() == null ? "" : u.getFirstName()) + " "
                + (u.getLastName() == null ? "" : u.getLastName())).trim();
        if (u.getUsername() != null && !u.getUsername().isBlank()) {
            name = name.isEmpty() ? "@" + u.getUsername() : name + " (@" + u.getUsername() + ")";
        }
        return name.isEmpty() ? null : name;
    }

    private static ReviewStatus parseStatus(String raw) {
        if (raw == null || raw.isBlank() || "ALL".equalsIgnoreCase(raw)) {
            return null;
        }
        try {
            return ReviewStatus.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("unknown status: " + raw);
        }
    }

    private static byte[] parseUuid(String id) {
        try {
            return UuidUtil.toBytes(id.trim());
        } catch (IllegalArgumentException e) {
            throw new NotFoundException("not found");
        }
    }
}
