package com.maxsolch.shop.order.app;

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
        verify(events, org.mockito.Mockito.atLeastOnce()).publishEvent(any(OrderEvents.Edited.class));
    }

    @Test
    void applyDiscount_clearReleasesTheRealPromoUsageAndDropsTheDiscount() {
        Order o = orderWithOneLine(OrderStatus.APPROVED, 10_000, 1);
        o.setPromoCode("SAVE10");
        o.setDiscountMinor(1_000);
        o.setTotalMinor(9_000);
        PromoCode code = new PromoCode();
        code.setCode("SAVE10");
        code.setUsesCount(3);
        when(promoCodeRepository.findByCodeForUpdate("SAVE10")).thenReturn(Optional.of(code));

        app.editing().applyDiscount(o.getId(), null, null, null, true, false);

        assertThat(code.getUsesCount()).isEqualTo(2);
        assertThat(o.getPromoCode()).isNull();
        assertThat(o.getDiscountMinor()).isZero();
        assertThat(o.getTotalMinor()).isEqualTo(10_000);
    }

    @Test
    void applyDiscount_realCodeCountsOneUseAndGivesItsDiscount_shippedOrderIsRefused() {
        Order o = orderWithOneLine(OrderStatus.NEW, 10_000, 1);
        PromoCode code = new PromoCode();
        code.setCode("TEN");
        code.setActive(true);
        code.setDiscountPercent(10);
        code.setUsesCount(0);
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
}
