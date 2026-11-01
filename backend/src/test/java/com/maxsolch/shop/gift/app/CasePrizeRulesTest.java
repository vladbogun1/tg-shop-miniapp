package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.gift.domain.GiftCaseItem;
import com.maxsolch.shop.gift.domain.GiftError;
import com.maxsolch.shop.platform.error.DomainException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The only guard against a case prize discount that is too big: 0..50 %, up to 100 000 ₴, not both zero. */
class CasePrizeRulesTest {

    private static GiftCaseItem apply(Integer percent, Integer uah) {
        GiftCaseItem item = new GiftCaseItem();
        CasePrizeRules.setDiscount(item, percent, uah);
        return item;
    }

    private static void assertRejected(Integer percent, Integer uah, GiftError code) {
        assertThatThrownBy(() -> apply(percent, uah))
                .isInstanceOf(DomainException.BadRequest.class)
                .extracting(e -> ((DomainException) e).errorCode())
                .isEqualTo(code);
    }

    @Test
    void percent_fiftyIsTheTop_fiftyOneIsRefused() {
        assertThat(apply(50, null).getDiscountPercent()).isEqualTo(50);
        assertRejected(51, null, GiftError.PERCENT_OUT_OF_RANGE);
        assertRejected(100, null, GiftError.PERCENT_OUT_OF_RANGE);
        assertRejected(-1, 100, GiftError.PERCENT_OUT_OF_RANGE);
    }

    @Test
    void percent_oneIsTheBottom() {
        assertThat(apply(1, null).getDiscountPercent()).isEqualTo(1);
    }

    @Test
    void amount_hundredThousandIsTheTop_oneMoreIsRefused() {
        GiftCaseItem item = apply(null, 100_000);
        assertThat(item.getDiscountUah()).isEqualTo(100_000);
        assertThat(item.getDiscountPercent()).isZero();
        assertRejected(null, 100_001, GiftError.AMOUNT_OUT_OF_RANGE);
        assertRejected(null, -1, GiftError.AMOUNT_OUT_OF_RANGE);
    }

    @Test
    void amountOutOfRange_isRefusedEvenWithAValidPercent() {
        assertRejected(10, 100_001, GiftError.AMOUNT_OUT_OF_RANGE);
    }

    @Test
    void bothZeroOrMissing_isRefused() {
        assertRejected(0, 0, GiftError.DISCOUNT_REQUIRED);
        assertRejected(null, null, GiftError.DISCOUNT_REQUIRED);
    }

    @Test
    void percentWinsOverAmount_amountIsDropped() {
        GiftCaseItem item = apply(15, 500);
        assertThat(item.getDiscountPercent()).isEqualTo(15);
        assertThat(item.getDiscountUah()).isZero();
    }

    @Test
    void discountPrizeIsLiveOnlyWithSomethingToGive() {
        GiftCaseItem item = new GiftCaseItem();
        item.setKind(GiftCaseItem.Kind.DISCOUNT);
        item.setWeight(10);
        item.setDiscountPercent(0);
        item.setDiscountUah(0);
        assertThat(CasePrizeRules.live(item, java.util.Map.of())).isFalse();
        item.setDiscountUah(1);
        assertThat(CasePrizeRules.live(item, java.util.Map.of())).isTrue();
        item.setWeight(0);
        assertThat(CasePrizeRules.live(item, java.util.Map.of())).isFalse();
    }
}
