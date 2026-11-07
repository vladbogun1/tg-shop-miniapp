package com.maxsolch.shop.ai.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Money: micro-USD is the fact, kopecks are rounded up and never below the real sum. */
class AiMoneyTest {

    @Test
    void centsBecomeMicroDollars() {
        assertThat(AiMoney.microFromCents(1000)).isEqualTo(10_000_000L);
    }

    @Test
    void aTinyCallStillShowsAKopeck() {
        assertThat(AiMoney.costMinor(1, 42_000)).isEqualTo(1);
        assertThat(AiMoney.costMinor(0, 42_000)).isZero();
        assertThat(AiMoney.costMinor(5_000, 0)).isZero();
    }

    @Test
    void aTypicalCardCostsAboutTwentyKopecks() {
        // 4800 micro-USD = $0.0048, about 0.20 UAH at 42, rounded up to 21 kopecks
        assertThat(AiMoney.costMinor(4_800, 42_000)).isEqualTo(21);
    }

    @Test
    void tenDollarsAtTheRate() {
        assertThat(AiMoney.costMinor(10_000_000, 42_000)).isEqualTo(42_000);
        assertThat(AiMoney.centsToMinor(1000, 42_000)).isEqualTo(42_000);
    }

    @Test
    void theSettingKeepsKopecksPerDollar() {
        assertThat(AiMoney.rateMilliFromKopecks(4200)).isEqualTo(42_000);
    }
}
