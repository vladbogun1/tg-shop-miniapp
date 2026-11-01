package com.maxsolch.shop.order.app;

import static com.maxsolch.shop.promo.domain.PromoCodes.promo;
import com.maxsolch.shop.order.domain.OrderFixtures;
import com.maxsolch.shop.order.domain.OrderEvents;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.promo.domain.PromoCode;
import org.junit.jupiter.api.Test;
import java.util.Optional;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** OrderEditing: discounts applied by an admin. */
class OrderEditingTest extends OrderScenarioTestBase {

    @Test
    void applyDiscount_manualAmountIsCappedAtTheSubtotal_percentIsCappedAtHundred() {
        Order o = orderWithOneLine(OrderStatus.NEW, 10_000, 2);

        app.editing().applyDiscount(o.getId(), null, 5_000L, null, false, false);
        assertThat(o.getDiscountMinor()).isEqualTo(5_000);
        assertThat(o.getTotalMinor()).isEqualTo(15_000);
        assertThat(o.getPromoCode()).isEqualTo("Ручная скидка");

        app.editing().applyDiscount(o.getId(), null, 999_999L, null, false, false);
        assertThat(o.getDiscountMinor()).isEqualTo(20_000);
        assertThat(o.getTotalMinor()).isZero();
        assertThat(o.isPaid()).as("a free order counts as paid at once").isTrue();

        Order p = orderWithOneLine(OrderStatus.NEW, 10_000, 2);
        app.editing().applyDiscount(p.getId(), null, null, 25, false, true);
        assertThat(p.getDiscountMinor()).isEqualTo(5_000);
        assertThat(p.getPromoCode()).isEqualTo("Ручная скидка 25%");
        app.editing().applyDiscount(p.getId(), null, null, 400, false, true);
        assertThat(p.getDiscountMinor()).isEqualTo(20_000);
        verify(events, org.mockito.Mockito.atLeastOnce()).publish(any(OrderEvents.Edited.class));
    }

    @Test
    void applyDiscount_clearReleasesTheRealPromoUsageAndDropsTheDiscount() {
        Order o = orderWithOneLine(OrderStatus.APPROVED, 10_000, 1);
        OrderFixtures.set(o, "promoCode", "SAVE10");
        OrderFixtures.set(o, "discountMinor", 1_000);
        OrderFixtures.set(o, "totalMinor", 9_000);
        PromoCode code = promo().code("SAVE10").usesCount(3).build();
        when(promoCodeRepository.findByCodeForUpdate("SAVE10")).thenReturn(Optional.of(code));

        app.editing().applyDiscount(o.getId(), null, null, null, true, false);

        assertThat(code.getUsesCount()).isEqualTo(2);
        assertThat(o.getPromoCode()).isNull();
        assertThat(o.getDiscountMinor()).isZero();
        assertThat(o.getTotalMinor()).isEqualTo(10_000);
    }

    @Test
    void applyDiscount_codeWithNoUsesLeft_isRefusedAndNotCounted_lastUseGoesThrough() {
        Order o = orderWithOneLine(OrderStatus.NEW, 10_000, 1);
        PromoCode spent = promoCode("ONCE", 10, 1, 1, true);
        when(promoCodeRepository.findByCodeAndActiveTrueForUpdate("ONCE")).thenReturn(Optional.of(spent));

        assertThatThrownBy(() -> app.editing().applyDiscount(o.getId(), "ONCE", null, null, false, false))
                .isInstanceOf(DomainException.class)
                .extracting(e -> ((DomainException) e).errorCode())
                .isEqualTo(com.maxsolch.shop.order.domain.OrderError.PROMO_REJECTED_TAKEN);
        assertThat(spent.getUsesCount()).isEqualTo(1);

        PromoCode last = promoCode("LAST", 10, 2, 1, true);
        when(promoCodeRepository.findByCodeAndActiveTrueForUpdate("LAST")).thenReturn(Optional.of(last));

        app.editing().applyDiscount(o.getId(), "LAST", null, null, false, false);

        assertThat(last.getUsesCount()).isEqualTo(2);
        assertThat(o.getDiscountMinor()).isEqualTo(1_000);
    }

    @Test
    void applyDiscount_realCodeCountsOneUseAndGivesItsDiscount_shippedOrderIsRefused() {
        Order o = orderWithOneLine(OrderStatus.NEW, 10_000, 1);
        PromoCode code = promo().code("TEN").active(true).discountPercent(10).usesCount(0).build();
        when(promoCodeRepository.findByCodeAndActiveTrueForUpdate("TEN")).thenReturn(Optional.of(code));

        app.editing().applyDiscount(o.getId(), "TEN", null, null, false, false);

        assertThat(code.getUsesCount()).isEqualTo(1);
        assertThat(o.getDiscountMinor()).isEqualTo(1_000);
        assertThat(o.getPromoCode()).isEqualTo("TEN");

        Order shipped = orderWithOneLine(OrderStatus.SHIPPED, 10_000, 1);
        assertThatThrownBy(() -> app.editing().applyDiscount(shipped.getId(), null, 100L, null, false, false))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessage("заказ можно менять только в статусе «Новый» или «Одобрен»");
    }

    /** A code as the promo module would build it; {@code used} uses already counted. */
    private static PromoCode promoCode(String code, int percent, Integer maxUses, int used, boolean active) {
        PromoCode p = PromoCode.named(code);
        p.edit(percent, 0, maxUses, null, active);
        for (int i = 0; i < used; i++) {
            p.countUse();
        }
        return p;
    }
}
