package com.maxsolch.shop.order.infra;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class OrderQuickSearchTest {

    @Test
    void aPhoneIsReadWithoutPunctuation() {
        assertThat(OrderQuickSearch.phoneDigits("+38 (050) 111-22-33")).isEqualTo("380501112233");
        assertThat(OrderQuickSearch.phoneDigits("050 111")).isEqualTo("050111");
    }

    @Test
    void wordsAndTooFewDigitsAreNotAPhone() {
        assertThat(OrderQuickSearch.phoneDigits("Анна")).isNull();
        assertThat(OrderQuickSearch.phoneDigits("#5bf865c4")).isNull();
        assertThat(OrderQuickSearch.phoneDigits("12")).isNull();
        assertThat(OrderQuickSearch.phoneDigits(null)).isNull();
    }
}
