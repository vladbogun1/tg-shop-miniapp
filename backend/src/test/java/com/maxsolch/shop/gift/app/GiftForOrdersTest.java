package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.gift.domain.GiftCaseItem;
import com.maxsolch.shop.gift.domain.GiftCaseTier;
import com.maxsolch.shop.gift.domain.OrderGiftCase;
import com.maxsolch.shop.order.app.OrderGifts;
import com.maxsolch.shop.order.app.OrderGifts.Decision;
import com.maxsolch.shop.platform.error.DomainException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** What the gift hands the order: the discount choice, a prize within the limit, the single product, the recorder. */
@ExtendWith(MockitoExtension.class)
class GiftForOrdersTest {

    private static final GiftCaseTier.Tier SILVER = GiftCaseTier.Tier.SILVER;
    private static final String PRIZE = UUID.randomUUID().toString();

    @Mock
    GiftService giftService;
    @Mock
    GiftRegistryService registry;

    GiftForOrders gifts;

    @BeforeEach
    void setUp() {
        gifts = new GiftForOrders(giftService, registry, Clock.systemUTC());
    }

    private static GiftService.TierConfig silver(GiftService.CaseEntry... prizes) {
        return new GiftService.TierConfig(SILVER, 1_500_00, 10, 500, 0, List.of(prizes));
    }

    private static GiftService.CaseEntry product(long id) {
        return new GiftService.CaseEntry(id, SILVER, GiftCaseItem.Kind.PRODUCT, PRIZE, 0, 0, "COMMON", 1_000_000);
    }

    private OrderGifts.ThresholdPlan plan(String singleProduct, GiftService.TierConfig... tiers) {
        when(giftService.giftConfig()).thenReturn(Optional.of(new GiftService.GiftConfig(singleProduct, 100_00,
                List.of(tiers))));
        return gifts.thresholdPlan().orElseThrow();
    }

    @Test
    void theDiscountChoiceTakesTheGuaranteedDiscountAndNeverReadsTheLimit() {
        var plan = plan(null, silver(product(1)));

        Decision d = plan.decide(2_000_00, "discount", (id, max) -> true, () -> {
            throw new AssertionError("the limit is not needed");
        }, false);

        assertThat(d).isEqualTo(new Decision.Discount("SILVER", 200_00));
    }

    @Test
    void aPrizeAboveTheLimitLeftDoesNotDrop_theSingleProductFallbackIsCheckedAgainstItToo() {
        var plan = plan("single", silver(product(1)));
        long[] asked = new long[2];

        Decision noneDrops = plan.decide(2_000_00, null, (id, max) -> {
            asked[0] = max;
            return false;
        }, () -> 50_00, false);

        assertThat(noneDrops).isInstanceOf(Decision.None.class);
        assertThat(asked[0]).isEqualTo(50_00);

        Decision single = plan.decide(2_000_00, null, (id, max) -> "single".equals(id) && max >= 40_00, () -> 50_00, false);
        assertThat(single).isEqualTo(new Decision.ProductGift("single"));
    }

    @Test
    void aPrizeThatCanDropIsTheDecision_andItsRecorderSavesTheRecordWhenTheOrderHasAnId() {
        var plan = plan(null, silver(product(7)));

        Decision d = plan.decide(2_000_00, "CASE", (id, max) -> PRIZE.equals(id), () -> Long.MAX_VALUE, false);

        Decision.Prize prize = (Decision.Prize) d;
        assertThat(prize.tier()).isEqualTo("SILVER");
        assertThat(prize.productId()).isEqualTo(PRIZE);
        byte[] orderId = new byte[16];
        orderId[0] = 5;
        prize.recorder().save(orderId, "Prize title");
        ArgumentCaptor<OrderGiftCase> saved = ArgumentCaptor.forClass(OrderGiftCase.class);
        verify(giftService).saveOrderCase(saved.capture());
        assertThat(saved.getValue().getOrderId()).isEqualTo(orderId);
        assertThat(saved.getValue().getTitle()).isEqualTo("Prize title");
        assertThat(saved.getValue().getCaseItemId()).isEqualTo(7);
    }

    @Test
    void anAdminCaseOfATierWithoutPrizesIsRefused_andUnknownTierMeansSilver() {
        when(giftService.tier(SILVER)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> gifts.casePlan("nonsense")).isInstanceOf(DomainException.BadRequest.class);

        when(giftService.tier(SILVER)).thenReturn(Optional.of(silver(product(1))));
        var plan = gifts.casePlan(null);
        assertThat(plan.tier()).isEqualTo("SILVER");
        assertThat(plan.productIds()).containsExactly(PRIZE);
        assertThat(plan.draw((id, max) -> false, Long.MAX_VALUE, false)).isEmpty();
        assertThat(plan.draw((id, max) -> true, Long.MAX_VALUE, false)).isPresent();
    }

    @Test
    void theLimitLeftComesFromTheRegistryOfThePersonOfTheOrder() {
        var order = new com.maxsolch.shop.order.domain.Order();
        order.setUserId(1L);
        when(registry.remainingMinor(any(), any())).thenReturn(123L);

        assertThat(gifts.limitLeft(order)).isEqualTo(123L);
    }
}
