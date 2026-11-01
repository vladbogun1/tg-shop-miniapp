package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.gift.domain.GiftLine;
import com.maxsolch.shop.gift.domain.GiftPerson;
import com.maxsolch.shop.gift.infra.GiftRegistryStore;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.settings.app.SettingsService;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The monthly gift limit end to end through the real calculation: only the rows of the store and the
 * limit setting are supplied; the remainder, the border and the over-limit flag are computed for real.
 */
class GiftRegistryServiceTest {

    private static final GiftPerson ME = new GiftPerson(1L, 5L, "671234567");
    private static final Instant MID_OCT = Instant.parse("2026-10-15T09:00:00Z");

    private final GiftRegistryStore store = mock(GiftRegistryStore.class);
    private final SettingsService settings = mock(SettingsService.class);

    private GiftRegistryService service(int limitUah) {
        when(settings.getInt(GiftSettings.GIFT_MONTHLY_LIMIT_UAH)).thenReturn(limitUah);
        return new GiftRegistryService(store, settings, Clock.fixed(MID_OCT, ZoneOffset.UTC),
                new ShopZone("Europe/Kyiv"));
    }

    private static GiftLine gift(GiftPerson p, String created, String delivered, long unitMinor, int qty) {
        return new GiftLine("o" + created, Instant.parse(created), delivered == null ? null : Instant.parse(delivered),
                "DELIVERED", "Ім'я", "+380671234567", null, p, "Килимок", null, qty, unitMinor,
                GiftLine.SOURCE_CASE, "SILVER");
    }

    private void lines(GiftLine... l) {
        when(store.lines(any())).thenReturn(List.of(l));
    }

    @Test
    void limitIsHryvniasTimesHundred_zeroMeansNone() {
        assertThat(service(2161).limitMinor()).isEqualTo(216_100);
        assertThat(service(0).limitMinor()).isZero();
        assertThat(service(-5).limitMinor()).isZero();
    }

    @Test
    void noLimit_remainderIsUnbounded() {
        lines(gift(ME, "2026-10-02T10:00:00Z", "2026-10-03T10:00:00Z", 999_999_00, 1));
        assertThat(service(0).remainingMinor(ME, MID_OCT)).isEqualTo(Long.MAX_VALUE);
    }

    @Test
    void remainder_isTheLimitMinusWhatIsAlreadyGiven() {
        lines(gift(ME, "2026-10-02T10:00:00Z", "2026-10-03T10:00:00Z", 1_000_00, 1),
                gift(ME, "2026-10-04T10:00:00Z", null, 300_00, 2)); // undelivered, 2 pcs = 600
        assertThat(service(2161).remainingMinor(ME, MID_OCT)).isEqualTo(216_100 - 160_000);
    }

    @Test
    void nothingGivenYet_remainderIsTheWholeLimit() {
        lines();
        assertThat(service(2161).remainingMinor(ME, MID_OCT)).isEqualTo(216_100);
    }

    @Test
    void exactlyOnTheLimit_remainderIsZero_andOverTheLimitItNeverGoesNegative() {
        lines(gift(ME, "2026-10-02T10:00:00Z", "2026-10-03T10:00:00Z", 2_161_00, 1));
        assertThat(service(2161).remainingMinor(ME, MID_OCT)).isZero();
        lines(gift(ME, "2026-10-02T10:00:00Z", "2026-10-03T10:00:00Z", 2_500_00, 1));
        assertThat(service(2161).remainingMinor(ME, MID_OCT)).isZero();
    }

    @Test
    void oneKopeckLeft_isLeft() {
        lines(gift(ME, "2026-10-02T10:00:00Z", "2026-10-03T10:00:00Z", 2_160_99, 1));
        assertThat(service(2161).remainingMinor(ME, MID_OCT)).isEqualTo(1);
    }

    @Test
    void monthChangesInKyivTime_notUtc() {
        // 31.10 22:30 UTC is already 01.11 00:30 in Kyiv (winter time since 25.10).
        Instant kyivNovember = Instant.parse("2026-10-31T22:30:00Z");
        lines(gift(ME, "2026-10-10T10:00:00Z", "2026-10-12T10:00:00Z", 2_000_00, 1));
        // In October the gift counts, in Kyiv November it is a new month with the whole limit.
        assertThat(service(2161).remainingMinor(ME, Instant.parse("2026-10-31T20:30:00Z"))).isEqualTo(16_100);
        assertThat(service(2161).remainingMinor(ME, kyivNovember)).isEqualTo(216_100);
    }

    @Test
    void limitForOrder_reportsUsedAndRemainder_orMinusOneWithoutLimit() {
        byte[] id = new byte[16];
        when(store.personOfOrder(any())).thenReturn(java.util.Optional.of(ME));
        lines(gift(ME, "2026-10-02T10:00:00Z", "2026-10-03T10:00:00Z", 500_00, 1));

        GiftDtos.GiftLimitDto dto = service(2161).limitForOrder(id, MID_OCT).orElseThrow();
        assertThat(dto.month()).isEqualTo("2026-10");
        assertThat(dto.limitMinor()).isEqualTo(216_100);
        assertThat(dto.usedMinor()).isEqualTo(50_000);
        assertThat(dto.remainingMinor()).isEqualTo(166_100);

        assertThat(service(0).limitForOrder(id, MID_OCT).orElseThrow().remainingMinor()).isEqualTo(-1);
    }

    @Test
    void registry_overLimitIsStrictlyAbove_exactlyOnTheLimitIsFine() {
        GiftPerson other = new GiftPerson(2L, 6L, "509999999");
        lines(gift(ME, "2026-10-02T10:00:00Z", "2026-10-03T10:00:00Z", 2_161_00, 1),     // = limit
                gift(other, "2026-10-02T10:00:00Z", "2026-10-03T10:00:00Z", 2_161_01, 1)); // 1 kopeck over

        GiftDtos.GiftRegistryDto r = service(2161).registry(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31));

        assertThat(r.rows()).hasSize(2);
        assertThat(r.rows().stream().filter(x -> x.monthTotalMinor() == 2_161_00).findFirst().orElseThrow().overLimit())
                .isFalse();
        assertThat(r.rows().stream().filter(x -> x.monthTotalMinor() == 2_161_01).findFirst().orElseThrow().overLimit())
                .isTrue();
        assertThat(r.overLimit()).isEqualTo(1);
    }

    @Test
    void registry_noLimit_neverOver() {
        lines(gift(ME, "2026-10-02T10:00:00Z", "2026-10-03T10:00:00Z", 900_000_00, 1));
        GiftDtos.GiftRegistryDto r = service(0).registry(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31));
        assertThat(r.rows()).singleElement().extracting(GiftDtos.GiftRegistryRowDto::overLimit).isEqualTo(false);
    }
}
