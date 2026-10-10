package com.maxsolch.shop.analytics;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** The shop's own admins never count as customers in the event-based metrics. */
class StaffVisitorsTest {

    private static final long ADMIN = 9_000_000_000_000_001L;
    private final Instant t = Instant.parse("2026-10-05T10:00:00Z");
    private long seq;

    private EventClassifier.RawEvent ev(String channel, Long tg, String anon, String event, String productId) {
        return new EventClassifier.RawEvent(++seq, channel, tg, anon, anon == null ? "s" + tg : "w" + anon, event,
                null, "/", productId, t.plusSeconds(seq));
    }

    @Test
    void miniAppAdmin_andEveryBrowserTheAdminSignedInFrom_areLeftOut() {
        StaffVisitors.Staff staff = new StaffVisitors.Staff(Set.of(ADMIN), Set.of());
        List<EventClassifier.RawEvent> events = List.of(
                ev("MINIAPP", ADMIN, null, "product_view", "p1"),
                // the admin's browser: anonymous view first, sign-in later — the whole browser goes
                ev("WEB", null, "admin-browser", "product_view", "p1"),
                ev("WEB", ADMIN, "admin-browser", "add_to_cart", "p1"),
                ev("WEB", null, "customer-1", "product_view", "p1"),
                ev("MINIAPP", 5L, null, "add_to_cart", "p1"));

        List<EventClassifier.RawEvent> kept = staff.filter(events);

        assertThat(kept).extracting(EventClassifier.RawEvent::anonId).containsExactly("customer-1", null);
        assertThat(kept).extracting(EventClassifier.RawEvent::telegramUserId).containsExactly(null, 5L);
    }

    @Test
    void rolledUpVisitorDays_ofStaffAreRecognised() {
        StaffVisitors.Staff staff = new StaffVisitors.Staff(Set.of(ADMIN), Set.of("known-admin-browser"));
        LocalDate day = LocalDate.parse("2026-10-01");

        assertThat(staff.excludes(new EventClassifier.VisitorDay(day, "MINIAPP", "t:" + ADMIN, ADMIN, 1, 3))).isTrue();
        assertThat(staff.excludes(new EventClassifier.VisitorDay(day, "MINIAPP", "t:" + ADMIN, null, 1, 3))).isTrue();
        assertThat(staff.excludes(new EventClassifier.VisitorDay(day, "WEB", "a:known-admin-browser", null, 1, 3))).isTrue();
        assertThat(staff.excludes(new EventClassifier.VisitorDay(day, "WEB", "a:someone", null, 1, 3))).isFalse();
        assertThat(staff.excludes(new EventClassifier.VisitorDay(day, "MINIAPP", "t:5", 5L, 1, 3))).isFalse();
    }

    @Test
    void rollUp_dropsStaffFromProductInterest_butKeepsTheirVisitorDaysToRememberTheBrowser() {
        StaffVisitors.Staff staff = new StaffVisitors.Staff(Set.of(ADMIN), Set.of());
        List<EventClassifier.RawEvent> events = List.of(
                ev("WEB", ADMIN, "admin-browser", "product_view", "p1"),
                ev("WEB", null, "customer-1", "product_view", "p1"));

        EventClassifier.DayResult r = new AnalyticsAggregationService(null, null, null, null)
                .classifyWithoutStaff(events, staff, EventClassifier.TitleIndex.empty());

        assertThat(r.products()).singleElement().satisfies(p -> {
            assertThat(p.views()).isEqualTo(1);
            assertThat(p.viewers()).isEqualTo(1);
        });
        assertThat(r.visitors()).extracting(EventClassifier.VisitorDay::visitorKey)
                .containsExactlyInAnyOrder("a:customer-1", "a:admin-browser");
        // ...and the reader drops that visitor day
        EventClassifier.VisitorDay adminDay = r.visitors().stream()
                .filter(v -> v.visitorKey().equals("a:admin-browser")).findFirst().orElseThrow();
        assertThat(staff.excludes(adminDay)).isTrue();
    }
}
