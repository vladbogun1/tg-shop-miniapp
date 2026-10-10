package com.maxsolch.shop.review;

import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.domain.PromoCode;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.repository.OrderItemRepository;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.repository.PromoCodeRepository;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.review.ReviewDtos.SubmitRequest;
import com.maxsolch.shop.review.ReviewDtos.SubmitResult;
import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
import com.maxsolch.shop.site.SiteRevalidator;
import com.maxsolch.shop.web.BadRequestException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cache.CacheManager;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Writing a review, premoderation, and the bonus: one personal single-use code per order, issued
 * when the first review of the order becomes visible.
 */
@ExtendWith(MockitoExtension.class)
class ReviewServiceTest {

    private static final long USER = 100L;
    private static final Instant NOW = Instant.parse("2026-10-05T12:00:00Z");

    @Mock
    ProductReviewRepository reviews;
    @Mock
    OrderItemRepository orderItems;
    @Mock
    OrderRepository orders;
    @Mock
    UserRepository users;
    @Mock
    PromoCodeRepository promoCodes;
    @Mock
    ReviewStore store;
    @Mock
    SettingsService settings;
    @Mock
    Messages messages;
    @Mock
    ReviewNotifier notifier;
    @Mock
    CacheManager cacheManager;
    @Mock
    SiteRevalidator siteRevalidator;

    ReviewService service;

    boolean premoderation = true;
    int bonusPercent = 5;

    @BeforeEach
    void setUp() {
        service = new ReviewService(reviews, orderItems, orders, users, promoCodes, store, settings, messages,
                notifier, cacheManager, siteRevalidator);
        service.setClock(Clock.fixed(NOW, ZoneOffset.UTC));
        lenient().when(settings.get(eq(SettingsRegistry.REVIEWS_ENABLED), any(Boolean.class))).thenReturn(true);
        lenient().when(settings.get(eq(SettingsRegistry.REVIEWS_PREMODERATION), any(Boolean.class)))
                .thenAnswer(inv -> premoderation);
        lenient().when(settings.get(eq(SettingsRegistry.REVIEWS_BONUS_PERCENT), any(Integer.class)))
                .thenAnswer(inv -> bonusPercent);
        lenient().when(settings.get(eq(SettingsRegistry.REVIEWS_BONUS_VALID_DAYS), any(Integer.class))).thenReturn(60);
        lenient().when(settings.get(eq(SettingsRegistry.REVIEWS_MIN_LENGTH), any(Integer.class))).thenReturn(10);
        lenient().when(settings.get(eq(SettingsRegistry.REVIEWS_MAX_PER_DAY), any(Integer.class))).thenReturn(10);
        lenient().when(messages.current(anyString())).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(reviews.saveAndFlush(any(ProductReview.class))).thenAnswer(inv -> {
            ProductReview r = inv.getArgument(0);
            if (r.getId() == null) {
                r.setId(7L);
            }
            return r;
        });
        lenient().when(promoCodes.save(any(PromoCode.class))).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(promoCodes.findByCode(anyString())).thenReturn(Optional.empty());
        lenient().when(store.productInfos(any())).thenReturn(Map.of());
        lenient().when(users.findById(anyLong())).thenReturn(Optional.empty());
    }

    private OrderItem deliveredLine(long ownerId) {
        Order o = ReviewRulesTest.order(ownerId, OrderStatus.DELIVERED);
        OrderItem item = ReviewRulesTest.line(o, 11L);
        when(orderItems.findById(11L)).thenReturn(Optional.of(item));
        when(reviews.findByOrderItemId(11L)).thenReturn(Optional.empty());
        return item;
    }

    private static SubmitRequest request() {
        return new SubmitRequest(11L, 5, "Отличная мышь, рекомендую");
    }

    @Test
    void premoderationKeepsTheReviewPendingWithoutBonus() {
        deliveredLine(USER);

        SubmitResult result = service.submit(USER, request());

        assertThat(result.review().status()).isEqualTo("PENDING");
        assertThat(result.review().editable()).isTrue();
        assertThat(result.bonus()).isNull();
        verify(store, never()).recomputeRating(any());
        verify(store, never()).claimBonus(any(), any());
        verify(promoCodes, never()).save(any());
        verify(notifier).pendingForModeration(eq("Мышь"), eq(5), anyLong());
    }

    @Test
    void withoutPremoderationTheReviewIsPublishedAndEarnsAPersonalCode() {
        premoderation = false;
        OrderItem item = deliveredLine(USER);
        when(store.claimBonus(item.getOrder().getId(), NOW)).thenReturn(true);

        SubmitResult result = service.submit(USER, request());

        assertThat(result.review().status()).isEqualTo("PUBLISHED");
        verify(store).recomputeRating(item.getProductId());
        ArgumentCaptor<PromoCode> promo = ArgumentCaptor.forClass(PromoCode.class);
        verify(promoCodes).save(promo.capture());
        PromoCode code = promo.getValue();
        assertThat(code.getCode()).startsWith(ReviewRules.BONUS_PREFIX);
        assertThat(code.getDiscountPercent()).isEqualTo(5);
        assertThat(code.getMaxUses()).isEqualTo(1);
        assertThat(code.getOwnerUserId()).isEqualTo(USER);
        assertThat(code.getExpiresAt()).isEqualTo(NOW.plus(Duration.ofDays(60)));
        assertThat(code.getSource()).isEqualTo(PromoCode.SOURCE_REVIEW_BONUS);
        assertThat(code.getSourceOrderId()).isEqualTo(item.getOrder().getId());
        assertThat(result.bonus()).isNotNull();
        assertThat(result.bonus().code()).isEqualTo(code.getCode());
        verify(notifier).bonusIssued(eq(USER), eq(code.getCode()), eq(5), eq(code.getExpiresAt()));
    }

    @Test
    void onlyOneBonusPerOrder() {
        premoderation = false;
        OrderItem item = deliveredLine(USER);
        // Another review of the same order already claimed the bonus.
        when(store.claimBonus(item.getOrder().getId(), NOW)).thenReturn(false);

        SubmitResult result = service.submit(USER, request());

        assertThat(result.review().status()).isEqualTo("PUBLISHED");
        assertThat(result.bonus()).isNull();
        verify(promoCodes, never()).save(any());
        verify(notifier, never()).bonusIssued(any(), any(), any(Integer.class), any());
    }

    @Test
    void zeroPercentMeansNoBonus() {
        premoderation = false;
        bonusPercent = 0;
        deliveredLine(USER);

        SubmitResult result = service.submit(USER, request());

        assertThat(result.bonus()).isNull();
        verify(store, never()).claimBonus(any(), any());
        verify(promoCodes, never()).save(any());
    }

    @Test
    void adminPublishIssuesTheBonusOfTheFirstPublishedReview() {
        ProductReview pending = new ProductReview();
        pending.setId(3L);
        pending.setProductId(new byte[16]);
        pending.setOrderId(new byte[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16});
        pending.setUserId(USER);
        pending.setTgUserId(USER);
        pending.setRating(4);
        pending.setText("Хороший товар, всё ок");
        pending.setStatus(ReviewStatus.PENDING);
        when(reviews.findById(3L)).thenReturn(Optional.of(pending));
        when(store.claimBonus(pending.getOrderId(), NOW)).thenReturn(true);

        ReviewDtos.AdminReview published = service.publish(3L);

        assertThat(published.status()).isEqualTo("PUBLISHED");
        assertThat(pending.getPublishedAt()).isEqualTo(NOW);
        verify(store).recomputeRating(pending.getProductId());
        verify(promoCodes).save(any(PromoCode.class));

        // Publishing it again (already published) changes nothing and issues nothing.
        service.publish(3L);
        verify(promoCodes).save(any(PromoCode.class));
    }

    @Test
    void cannotReviewAnUndeliveredOrder() {
        Order o = ReviewRulesTest.order(USER, OrderStatus.SHIPPED);
        OrderItem item = ReviewRulesTest.line(o, 11L);
        when(orderItems.findById(11L)).thenReturn(Optional.of(item));
        when(reviews.findByOrderItemId(11L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.submit(USER, request()))
                .isInstanceOf(BadRequestException.class)
                .hasMessage("api.review.notDelivered");
        verify(reviews, never()).saveAndFlush(any());
    }

    @Test
    void cannotReviewSomeoneElsesOrder() {
        deliveredLine(200L);

        assertThatThrownBy(() -> service.submit(USER, request()))
                .isInstanceOf(BadRequestException.class)
                .hasMessage("api.review.notYours");
    }

    @Test
    void oneReviewPerLineButOwnPendingCanBeEdited() {
        ProductReview existing = new ProductReview();
        existing.setId(5L);
        existing.setProductId(new byte[16]);
        existing.setOrderItemId(11L);
        existing.setUserId(USER);
        existing.setRating(3);
        existing.setText("Сначала так себе было");
        existing.setStatus(ReviewStatus.PENDING);
        when(reviews.findByOrderItemId(11L)).thenReturn(Optional.of(existing));

        SubmitResult edited = service.submit(USER, request());
        assertThat(edited.review().rating()).isEqualTo(5);
        assertThat(existing.getText()).isEqualTo("Отличная мышь, рекомендую");

        // Published — no more edits; somebody else's — "already reviewed".
        existing.setStatus(ReviewStatus.PUBLISHED);
        assertThatThrownBy(() -> service.submit(USER, request())).hasMessage("api.review.notEditable");
        existing.setUserId(200L);
        assertThatThrownBy(() -> service.submit(USER, request())).hasMessage("api.review.already");
    }

    @Test
    void textAndDailyLimitAreEnforced() {
        deliveredLine(USER);
        assertThatThrownBy(() -> service.submit(USER, new SubmitRequest(11L, 5, "мало")))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.submit(USER, new SubmitRequest(11L, 0, "Отличная мышь, рекомендую")))
                .hasMessage("api.review.rating");

        when(reviews.countByUserIdAndCreatedAtAfter(eq(USER), any())).thenReturn(10L);
        assertThatThrownBy(() -> service.submit(USER, request())).isInstanceOf(BadRequestException.class);
        verify(reviews, never()).saveAndFlush(any());
    }

    @Test
    void bonusStates() {
        PromoCode p = new PromoCode();
        p.setCode("THANKS-ABCDEF");
        p.setDiscountPercent(5);
        p.setMaxUses(1);
        p.setExpiresAt(NOW.plus(Duration.ofDays(1)));
        assertThat(ReviewService.toBonus(p, NOW).state()).isEqualTo("ACTIVE");
        assertThat(ReviewService.toBonus(p, NOW.plus(Duration.ofDays(2))).state()).isEqualTo("EXPIRED");
        p.setUsesCount(1);
        assertThat(ReviewService.toBonus(p, NOW).state()).isEqualTo("USED");
    }

    @Test
    void adminListForOneProductCountsTabsOfThatProductOnly() {
        byte[] product = com.maxsolch.shop.common.UuidUtil.randomBytes();
        String productId = com.maxsolch.shop.common.UuidUtil.toString(product);
        when(reviews.findByProductIdAndStatus(any(), eq(ReviewStatus.PENDING), any()))
                .thenReturn(org.springframework.data.domain.Page.empty());
        when(reviews.countByProductIdAndStatus(any(), eq(ReviewStatus.PENDING))).thenReturn(1L);
        when(reviews.countByProductIdAndStatus(any(), eq(ReviewStatus.PUBLISHED))).thenReturn(4L);
        when(reviews.countByProductIdAndStatus(any(), eq(ReviewStatus.HIDDEN))).thenReturn(0L);

        ReviewDtos.AdminPage page = service.adminList("PENDING", productId, 0, 30);

        assertThat(page.pendingCount()).isEqualTo(1);
        assertThat(page.publishedCount()).isEqualTo(4);
        assertThat(page.hiddenCount()).isZero();
        // Not the whole shop's counters.
        verify(reviews, never()).countByStatus(any());
    }
}
