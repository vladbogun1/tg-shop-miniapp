package com.maxsolch.shop.promo.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/** What a personal one-time code and the use counter promise, whoever builds the code. */
class PromoCodeTest {

    private static final Instant EXPIRES = Instant.parse("2026-12-01T00:00:00Z");

    @Test
    void personalOneTime_isSingleUseOwnedAndExpiring() {
        PromoCode p = PromoCode.personalOneTime("C1", 7L, 10, 5_000, 0, EXPIRES, PromoCode.SOURCE_GIFT_CASE, new byte[]{1});
        assertThat(p.getMaxUses()).isEqualTo(1);
        assertThat(p.getUsesCount()).isZero();
        assertThat(p.isActive()).isTrue();
        assertThat(p.usableBy(7L)).isTrue();
        assertThat(p.usableBy(8L)).isFalse();
        assertThat(p.getExpiresAt()).isEqualTo(EXPIRES);
        assertThat(p.getSource()).isEqualTo(PromoCode.SOURCE_GIFT_CASE);
    }

    @Test
    void personalOneTime_aPercentWinsOverAmountAndIsHeldTo100() {
        PromoCode p = PromoCode.personalOneTime("C1", 7L, 150, 5_000, 0, EXPIRES, "S", null);
        assertThat(p.getDiscountPercent()).isEqualTo(100);
        assertThat(p.getDiscountAmountMinor()).isZero();
    }

    @Test
    void personalOneTime_withoutPercentTakesAmount_neverNegative() {
        assertThat(PromoCode.personalOneTime("C1", 7L, 0, 5_000, 0, EXPIRES, "S", null).getDiscountAmountMinor())
                .isEqualTo(5_000);
        PromoCode negative = PromoCode.personalOneTime("C1", 7L, -5, -1, 0, EXPIRES, "S", null);
        assertThat(negative.getDiscountPercent()).isZero();
        assertThat(negative.getDiscountAmountMinor()).isZero();
    }

    @Test
    void personalOneTime_keepsTheCeiling() {
        assertThat(PromoCode.personalOneTime("C1", 7L, 5, 0, 10_000, EXPIRES, "S", null).getMaxDiscountMinor())
                .isEqualTo(10_000);
    }

    @Test
    void uses_countAndGiveBack_neverBelowZero() {
        PromoCode p = PromoCode.named("A");
        p.countUse();
        assertThat(p.getUsesCount()).isEqualTo(1);
        assertThat(p.giveBackUse()).isTrue();
        assertThat(p.giveBackUse()).isFalse();
        assertThat(p.getUsesCount()).isZero();
    }

    @Test
    void edit_leavesCeilingAndActiveWhenNull() {
        PromoCode p = PromoCode.named("A");
        p.edit(10, 0, 5, 9_000L, false);
        p.edit(20, 0, null, null, null);
        assertThat(p.getDiscountPercent()).isEqualTo(20);
        assertThat(p.getMaxUses()).isNull();
        assertThat(p.getMaxDiscountMinor()).isEqualTo(9_000);
        assertThat(p.isActive()).isFalse();
    }

    @Test
    void clampPercent() {
        assertThat(PromoCode.clampPercent(150)).isEqualTo(100);
        assertThat(PromoCode.clampPercent(-3)).isZero();
        assertThat(PromoCode.clampPercent(42)).isEqualTo(42);
    }
}
