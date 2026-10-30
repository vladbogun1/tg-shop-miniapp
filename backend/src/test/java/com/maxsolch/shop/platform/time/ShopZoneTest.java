package com.maxsolch.shop.platform.time;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class ShopZoneTest {

    @Test
    void blankOrBadSettingFallsBackToKyiv() {
        assertThat(new ShopZone(null).zone()).isEqualTo(ZoneId.of("Europe/Kyiv"));
        assertThat(new ShopZone("  ").zone()).isEqualTo(ZoneId.of("Europe/Kyiv"));
        assertThat(new ShopZone("Mars/Olympus").zone()).isEqualTo(ZoneId.of("Europe/Kyiv"));
    }

    @Test
    void configuredZoneIsUsed() {
        assertThat(new ShopZone(" Europe/Warsaw ").zone()).isEqualTo(ZoneId.of("Europe/Warsaw"));
    }

    @Test
    void todayIsCutInTheShopZoneNotInUtc() {
        // 22:30 UTC on 1 Jan is already 2 Jan in Kyiv (UTC+2 in winter)
        Clock clock = Clock.fixed(Instant.parse("2026-01-01T22:30:00Z"), ZoneOffset.UTC);

        assertThat(new ShopZone("Europe/Kyiv").today(clock)).isEqualTo(LocalDate.of(2026, 1, 2));
        assertThat(new ShopZone("UTC").today(clock)).isEqualTo(LocalDate.of(2026, 1, 1));
    }
}
