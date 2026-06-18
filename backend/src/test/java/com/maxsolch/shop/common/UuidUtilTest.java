package com.maxsolch.shop.common;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UuidUtilTest {

    @Test
    void toBytes_thenToUuid_roundTrips() {
        UUID original = UUID.fromString("11223344-5566-7788-99aa-bbccddeeff00");

        byte[] bytes = UuidUtil.toBytes(original);
        UUID back = UuidUtil.toUuid(bytes);

        assertThat(back).isEqualTo(original);
    }

    @Test
    void toBytes_isSixteenBytes_msbFirst() {
        UUID original = UUID.fromString("11223344-5566-7788-99aa-bbccddeeff00");

        byte[] bytes = UuidUtil.toBytes(original);

        assertThat(bytes).hasSize(16);
        // MSB-first layout: first byte is the high byte of the most-significant bits.
        assertThat(bytes[0]).isEqualTo((byte) 0x11);
        assertThat(bytes[1]).isEqualTo((byte) 0x22);
        assertThat(bytes[15]).isEqualTo((byte) 0x00);
        assertThat(bytes[14]).isEqualTo((byte) 0xff);
    }

    @Test
    void stringRoundTrip() {
        String uuid = UUID.randomUUID().toString();

        byte[] bytes = UuidUtil.toBytes(uuid);
        String back = UuidUtil.toString(bytes);

        assertThat(back).isEqualTo(uuid);
    }

    @Test
    void randomBytes_isSixteenBytes() {
        assertThat(UuidUtil.randomBytes()).hasSize(16);
    }

    @Test
    void toBytes_nullUuid_returnsNull() {
        UUID nullUuid = null;
        assertThat(UuidUtil.toBytes(nullUuid)).isNull();
    }

    @Test
    void toUuid_null_returnsNull() {
        assertThat(UuidUtil.toUuid(null)).isNull();
    }

    @Test
    void toUuid_wrongLength_throws() {
        assertThatThrownBy(() -> UuidUtil.toUuid(new byte[15]))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("16 bytes");
    }

    @Test
    void toBytes_invalidString_throws() {
        assertThatThrownBy(() -> UuidUtil.toBytes("not-a-uuid"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
