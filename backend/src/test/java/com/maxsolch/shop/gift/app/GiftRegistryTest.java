package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.gift.app.GiftRegistryService.Line;
import com.maxsolch.shop.gift.app.GiftRegistryService.Person;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.YearMonth;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class GiftRegistryTest {

    private static final YearMonth OCT = YearMonth.of(2026, 10);

    private static Line line(Person p, String created, String delivered, long unit) {
        return new Line("o", Instant.parse(created), delivered == null ? null : Instant.parse(delivered), "DELIVERED",
                "Ім'я", "+380671234567", null, p, "Килимок", null, 1, unit, GiftRegistryService.SOURCE_CASE, "SILVER");
    }

    @Test
    void phoneKeyIgnoresFormatAndCountryCode() {
        assertThat(GiftRegistryService.phoneKey("+38 (067) 123-45-67")).isEqualTo("671234567");
        assertThat(GiftRegistryService.phoneKey("0671234567")).isEqualTo("671234567");
        assertThat(GiftRegistryService.phoneKey("12345")).isNull();
        assertThat(GiftRegistryService.phoneKey(null)).isNull();
    }

    @Test
    void peopleSharingAnyKeyAreOnePersonTransitively() {
        Person site = new Person(1L, null, "671234567");
        Person tgSamePhone = new Person(null, 99L, "671234567");
        Person tgOtherPhone = new Person(null, 99L, "509999999");
        Person stranger = new Person(2L, 7L, "631111111");
        int[] g = GiftRegistryService.groups(List.of(site, tgSamePhone, tgOtherPhone, stranger), null);
        assertThat(g[0]).isEqualTo(g[1]).isEqualTo(g[2]);
        assertThat(g[3]).isNotEqualTo(g[0]);
    }

    @Test
    void usedCountsThisMonthAndUndeliveredOfTheSamePerson() {
        Person me = new Person(1L, 5L, "671234567");
        Person otherAccountSamePhone = new Person(2L, null, "671234567");
        Person stranger = new Person(3L, 6L, "509999999");
        List<Line> lines = List.of(
                line(me, "2026-10-02T10:00:00Z", "2026-10-05T10:00:00Z", 1500_00),          // this month
                line(otherAccountSamePhone, "2026-10-10T10:00:00Z", null, 300_00),           // not delivered yet
                line(me, "2026-09-20T10:00:00Z", "2026-09-25T10:00:00Z", 2000_00),          // last month
                line(stranger, "2026-10-03T10:00:00Z", "2026-10-04T10:00:00Z", 2000_00));   // someone else
        Person checkout = new Person(null, 5L, GiftRegistryService.phoneKey("067 123 45 67"));
        assertThat(GiftRegistryService.usedMinor(checkout, lines, OCT)).isEqualTo(1800_00);
    }

    @Test
    void deliveredMonthWinsOverOrderMonth() {
        Person me = new Person(1L, null, null);
        // Ordered in September, delivered in October — an October gift.
        Line l = line(me, "2026-09-29T10:00:00Z", "2026-10-01T10:00:00Z", 1000_00);
        assertThat(l.month()).isEqualTo(OCT);
        assertThat(GiftRegistryService.usedMinor(me, List.of(l), OCT)).isEqualTo(1000_00);
        assertThat(GiftRegistryService.usedMinor(me, List.of(l), YearMonth.of(2026, 9))).isZero();
    }

    @Test
    void monthIsInKyivTime() {
        Person me = new Person(1L, null, null);
        // 31.10 23:30 UTC = 01.11 01:30 in Kyiv.
        Line l = line(me, "2026-10-20T10:00:00Z", "2026-10-31T23:30:00Z", 100_00);
        assertThat(l.month()).isEqualTo(YearMonth.of(2026, 11));
    }
}
