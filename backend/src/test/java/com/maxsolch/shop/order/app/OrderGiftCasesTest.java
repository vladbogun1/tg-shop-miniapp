package com.maxsolch.shop.order.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.order.domain.GiftCaseRules;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.catalog.domain.Product;
import org.junit.jupiter.api.Test;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** OrderGiftCases: size of a case prize and the case given by an admin. */
class OrderGiftCasesTest extends OrderScenarioTestBase {

    @Test
    void casePrizeSizesAreTheHeldOneAndThoseInStock() {
        SizedPrize s = sizedPrize(OrderStatus.NEW);
        assertThat(app.giftCases().casePrizeSizes(s.order())).extracting(OrderGiftCases.PrizeSize::name).containsExactly("M", "L");
        assertThat(app.giftCases().casePrizeSizes(s.order()).get(0).current()).isTrue();
    }

    @Test
    void choosingAnotherSizeMovesTheHold() {
        SizedPrize s = sizedPrize(OrderStatus.APPROVED);
        app.giftCases().chooseCasePrizeSize(s.order().getId(), UuidUtil.toString(s.l().getId()));
        assertThat(s.m().getStock()).isEqualTo(4);
        assertThat(s.l().getStock()).isZero();
        assertThat(s.product().getStock()).isEqualTo(4); // rollup
        assertThat(s.line().getVariantId()).isEqualTo(s.l().getId());
        assertThat(s.line().getVariantNameSnapshot()).isEqualTo("L");
        assertThat(s.line().isVariantPending()).isFalse();
    }

    @Test
    void choosingTheHeldSizeOnlyConfirmsIt() {
        SizedPrize s = sizedPrize(OrderStatus.NEW);
        app.giftCases().chooseCasePrizeSize(s.order().getId(), UuidUtil.toString(s.m().getId()));
        assertThat(s.m().getStock()).isEqualTo(3);
        assertThat(s.line().isVariantPending()).isFalse();
    }

    @Test
    void aSizeOutOfStockOrAShippedOrderIsRefused() {
        SizedPrize s = sizedPrize(OrderStatus.NEW);
        assertThatThrownBy(() -> app.giftCases().chooseCasePrizeSize(s.order().getId(), UuidUtil.toString(s.xl().getId())))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThat(s.line().isVariantPending()).isTrue();
        SizedPrize shipped = sizedPrize(OrderStatus.SHIPPED);
        assertThatThrownBy(() -> app.giftCases().chooseCasePrizeSize(shipped.order().getId(), UuidUtil.toString(shipped.l().getId())))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThat(shipped.l().getStock()).isEqualTo(1);
    }

    @Test
    void grantGiftCase_drawsAPrizeSealsItAndNeedsAnOpenOrderWithoutACase() {
        var tier = com.maxsolch.shop.gift.GiftCaseTier.Tier.SILVER;
        String prizeUuid = UUID.randomUUID().toString();
        Product prize = new Product();
        prize.setId(UuidUtil.toBytes(prizeUuid));
        prize.setTitle("Prize");
        prize.setPriceMinor(3_000_00);
        prize.setStock(5);
        prize.setActive(true);
        prize.setVariants(new ArrayList<>());
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(prize));
        when(gift.tier(tier)).thenReturn(Optional.of(new com.maxsolch.shop.gift.GiftService.TierConfig(tier, 1_500_00,
                0, 0, 0, List.of(new com.maxsolch.shop.gift.GiftService.CaseEntry(1, tier,
                com.maxsolch.shop.gift.GiftCaseItem.Kind.PRODUCT, prizeUuid, 0, 0, "COMMON", 1_000_000)))));
        Order o = orderWithOneLine(OrderStatus.APPROVED, 10_000, 1);

        Order granted = app.giftCases().grantGiftCase(o.getId(), tier, true);

        assertThat(granted.getGiftCaseStatus()).isEqualTo(GiftCaseRules.GIFT_CASE_SEALED);
        assertThat(granted.getGiftTier()).isEqualTo("SILVER");
        OrderItem line = granted.getItems().stream().filter(OrderItem::isGift).findFirst().orElseThrow();
        assertThat(line.getPriceMinorSnapshot()).isZero();
        assertThat(prize.getStock()).isEqualTo(4);
        verify(gift).saveOrderCase(any());
        // a second case is refused
        assertThatThrownBy(() -> app.giftCases().grantGiftCase(o.getId(), tier, false))
                .isInstanceOf(DomainException.BadRequest.class).hasMessage("У заказа уже есть кейс");
        // and so is a closed order
        Order shipped = orderWithOneLine(OrderStatus.SHIPPED, 10_000, 1);
        assertThatThrownBy(() -> app.giftCases().grantGiftCase(shipped.getId(), tier, false))
                .isInstanceOf(DomainException.BadRequest.class);
    }
}
