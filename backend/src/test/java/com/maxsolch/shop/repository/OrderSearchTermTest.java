package com.maxsolch.shop.repository;

import com.maxsolch.shop.common.UuidUtil;
import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

class OrderSearchTermTest {

    private static final String ID = "5bf865c4-1234-4abc-8def-0123456789ab";

    @Test
    void blank_isNoFilter() {
        assertThat(OrderSearchTerm.parse(null)).isEqualTo(OrderSearchTerm.NONE);
        assertThat(OrderSearchTerm.parse("  ").like()).isNull();
    }

    @Test
    void shortNumberWithHash_matchesThatOrdersIdRange() {
        OrderSearchTerm t = OrderSearchTerm.parse("#5BF865C4");

        assertThat(t.idLo()).isNotNull();
        assertThat(within(UuidUtil.toBytes(ID), t)).isTrue();
        assertThat(within(UuidUtil.toBytes("5bf865c5-0000-0000-0000-000000000000"), t)).isFalse();
        assertThat(within(UuidUtil.toBytes("5bf865c3-ffff-ffff-ffff-ffffffffffff"), t)).isFalse();
    }

    @Test
    void shortNumberWithoutHash_andFullUuid_work() {
        assertThat(within(UuidUtil.toBytes(ID), OrderSearchTerm.parse("5bf865c4"))).isTrue();
        OrderSearchTerm full = OrderSearchTerm.parse(ID);
        assertThat(full.idLo()).isEqualTo(full.idHi()).isEqualTo(UuidUtil.toBytes(ID));
    }

    @Test
    void oddLengthPrefix_isCovered() {
        assertThat(within(UuidUtil.toBytes(ID), OrderSearchTerm.parse("5bf86"))).isTrue();
    }

    @Test
    void wordsAndPhones_doNotBecomeIdRangesUnlessHex() {
        assertThat(OrderSearchTerm.parse("Іван").idLo()).isNull();
        assertThat(OrderSearchTerm.parse("abc").idLo()).isNull(); // shorter than the minimum
        assertThat(OrderSearchTerm.parse("+380671234567").idLo()).isNull();
    }

    @Test
    void likeWildcardsAreEscaped() {
        assertThat(OrderSearchTerm.parse("50%_off!").like()).isEqualTo("%50!%!_off!!%");
        assertThat(OrderSearchTerm.parse(" ТТН ").like()).isEqualTo("%ттн%");
    }

    private static boolean within(byte[] id, OrderSearchTerm t) {
        return Arrays.compareUnsigned(id, t.idLo()) >= 0 && Arrays.compareUnsigned(id, t.idHi()) <= 0;
    }
}
