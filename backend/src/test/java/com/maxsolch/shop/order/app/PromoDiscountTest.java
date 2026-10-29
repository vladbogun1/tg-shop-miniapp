package com.maxsolch.shop.order.app;

import com.maxsolch.shop.promo.domain.PromoDiscount;
import com.maxsolch.shop.promo.domain.PromoCode;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;

/** PromoDiscount: the discount arithmetic. */
class PromoDiscountTest extends OrderScenarioTestBase {

    @Test
    void discountFor_capsPercentAtOneHundred() {
        PromoCode broken = new PromoCode();
        broken.setDiscountPercent(150); // misconfigured code

        // Capped at the subtotal, so a total can never go negative and the stored discount can
        // never exceed the order itself.
        assertThat(PromoDiscount.discountFor(broken, 10_000)).isEqualTo(10_000);
    }

    @Test
    void discountFor_fixedAmountBeatsPercentAndIsCapped() {
        PromoCode promo = new PromoCode();
        promo.setDiscountAmountMinor(30_000);
        promo.setDiscountPercent(10);

        assertThat(PromoDiscount.discountFor(promo, 10_000)).isEqualTo(10_000);
        assertThat(PromoDiscount.discountFor(promo, 100_000)).isEqualTo(30_000);
    }

    @Test
    void discountFor_ceilingCapsThePercent() {
        PromoCode bonus = new PromoCode();
        bonus.setDiscountPercent(5);
        bonus.setMaxDiscountMinor(10_000); // 5 %, but at most 100 ₴

        assertThat(PromoDiscount.discountFor(bonus, 1_000_000)).isEqualTo(10_000); // 10 000 ₴ → −100 ₴
        assertThat(PromoDiscount.discountFor(bonus, 200_000)).isEqualTo(10_000);   // exactly 5 %
        assertThat(PromoDiscount.discountFor(bonus, 100_000)).isEqualTo(5_000);    // below the ceiling
        assertThat(PromoDiscount.discountFor(bonus, 4_000)).isEqualTo(200);

        bonus.setMaxDiscountMinor(0); // no ceiling
        assertThat(PromoDiscount.discountFor(bonus, 1_000_000)).isEqualTo(50_000);
    }

    @Test
    void discountFor_ceilingAppliesAfterTheExcludedPartAndThePercent() {
        PromoCode promo = new PromoCode();
        promo.setDiscountPercent(10);
        promo.setMaxDiscountMinor(15_000);

        // 10 000 ₴, of them 8 000 ₴ excluded: 10 % of 2 000 ₴ = 200 ₴ → ceiling 150 ₴.
        assertThat(PromoDiscount.discountFor(promo, 1_000_000, 800_000)).isEqualTo(15_000);
        // 9 000 ₴ excluded: 10 % of 1 000 ₴ = 100 ₴, under the ceiling.
        assertThat(PromoDiscount.discountFor(promo, 1_000_000, 900_000)).isEqualTo(10_000);
    }

    @Test
    void discountFor_ceilingAlsoCapsAFixedAmount() {
        PromoCode promo = new PromoCode();
        promo.setDiscountAmountMinor(30_000);
        promo.setMaxDiscountMinor(20_000);

        assertThat(PromoDiscount.discountFor(promo, 100_000)).isEqualTo(20_000);
        assertThat(PromoDiscount.discountFor(promo, 10_000)).isEqualTo(10_000); // still not above the subtotal
    }
}
