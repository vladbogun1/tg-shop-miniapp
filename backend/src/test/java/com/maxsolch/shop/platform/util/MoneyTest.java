package com.maxsolch.shop.platform.util;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Characterization: {@link Money} gives to the kopeck what the code gave before the policy was unified,
 * on a grid of amounts (all of the old formulas are written out here as they were).
 */
class MoneyTest {

    @Test
    void percentOfEqualsTheOldTruncatingFormula() {
        for (long amount = 0; amount <= 3_000_00; amount += 37) {
            for (int percent = 0; percent <= 100; percent++) {
                assertThat(Money.percentOf(amount, percent)).isEqualTo(amount * percent / 100);
            }
        }
        assertThat(Money.percentOf(1_999, 10)).as("199.9 kopecks are cut, not rounded").isEqualTo(199);
    }

    @Test
    void quotientEqualsMathRoundOfTheDoubleQuotientOnRealRanges() {
        for (int qty = 1; qty <= 300; qty++) {
            for (long extra = 0; extra <= 200_000; extra += 13) {
                assertThat(Money.quotient(extra, qty)).as(extra + "/" + qty)
                        .isEqualTo(Math.round((double) extra / qty));
            }
        }
        assertThat(Money.quotient(5, 2)).isEqualTo(3);
        assertThat(Money.quotient(7, 3)).isEqualTo(2);
    }

    @Test
    void convertRoundsHalfUp() {
        assertThat(Money.convert(1_000, new BigDecimal("41.2345"))).isEqualTo(41_235);
        assertThat(Money.convert(1, new BigDecimal("0.5"))).isEqualTo(1);
        assertThat(Money.convert(3, new BigDecimal("0.5"))).isEqualTo(2);
    }
}
