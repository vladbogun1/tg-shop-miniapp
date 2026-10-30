package com.maxsolch.shop.platform.journal;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.notification.domain.Broadcast;
import com.maxsolch.shop.notification.infra.BroadcastRepository;
import com.maxsolch.shop.notification.app.BroadcastHistoryDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** «Журнал → Бот и сайт» API: filters → SQL, the request mapping and the broadcast breakdown. */
class ActivityLogApiTest {

    private ActivityLogStore store;
    private ActivityLogController controller;

    @BeforeEach
    void setUp() {
        store = mock(ActivityLogStore.class);
        controller = new ActivityLogController(store, new ActivityLogRetentionJob(store, 90, 1095, java.time.Clock.systemUTC()), new com.maxsolch.shop.platform.time.ShopZone("Europe/Kyiv"), java.time.Clock.systemUTC());
    }

    private static ActivityLogStore.Filter filter(String order, String q) {
        return new ActivityLogStore.Filter(null, null, null, null, null, order, null, null, q, null, null);
    }

    // ------------------------------------------------------------------ SQL of the filters

    @Test
    void noFilterMeansEverything() {
        ActivityLogStore.Where w = ActivityLogStore.where(filter(null, null));
        assertThat(w.sql()).isEqualTo(" WHERE 1=1");
        assertThat(w.params()).isEmpty();
    }

    @Test
    void everyFilterIsAParameterNeverConcatenated() {
        ActivityLogStore.Where w = ActivityLogStore.where(new ActivityLogStore.Filter("BOT", "BROADCAST", "FAILED",
                "CUSTOMER", 42L, null, "broadcast:3", "BOT_BLOCKED", null,
                Instant.parse("2026-10-01T00:00:00Z"), Instant.parse("2026-10-02T00:00:00Z")));
        assertThat(w.sql()).contains("a.source = ?", "a.type = ?", "a.result = ?", "a.recipient = ?",
                "a.tg_user_id = ?", "a.group_id = ?", "a.error_code = ?", "a.created_at >= ?", "a.created_at < ?");
        assertThat(w.params()).hasSize(9).contains("BOT", "BROADCAST", "FAILED", 42L, "broadcast:3", "BOT_BLOCKED");
    }

    @Test
    void orderByFullUuidOrByTheShortId() {
        String id = "1a2b3c4d-0000-4000-8000-000000000001";
        ActivityLogStore.Where full = ActivityLogStore.where(filter(id, null));
        assertThat(full.sql()).contains("a.order_id = ?");
        assertThat((byte[]) full.params().get(0)).isEqualTo(UuidUtil.toBytes(id));

        ActivityLogStore.Where shortId = ActivityLogStore.where(filter("#1a2b3c4d", null));
        assertThat(shortId.sql()).contains("HEX(a.order_id) LIKE ?");
        assertThat(shortId.params()).containsExactly("1A2B3C4D%");

        assertThat(ActivityLogStore.where(filter("not-an-id", null)).sql()).contains("1=0");
    }

    @Test
    void searchMatchesTextNamesAndATelegramId() {
        ActivityLogStore.Where w = ActivityLogStore.where(filter(null, "123456789"));
        assertThat(w.sql()).contains("a.summary LIKE ?", "u.username LIKE ?", "OR a.tg_user_id = ?");
        assertThat(w.params()).contains("%123456789%", 123456789L);

        ActivityLogStore.Where like = ActivityLogStore.where(filter(null, "50%_off"));
        assertThat(like.params().get(0)).isEqualTo("%50\\%\\_off%");
        assertThat(like.sql()).doesNotContain("a.tg_user_id = ?");
    }

    // ------------------------------------------------------------------ controller

    @Test
    void listNormalisesTheFiltersAndCountsOnlyOnTheFirstPage() {
        when(store.search(any(), anyInt(), anyInt())).thenReturn(List.of());
        when(store.countByResult(any())).thenReturn(Map.of("OK", 3L));

        ActivityLogController.Page first = controller.list(0, 999, " bot ", "broadcast", "failed", null, 7L,
                " #1a2b3c4d ", null, null, " vasya ", "2026-10-01", "2026-10-07");

        ArgumentCaptor<ActivityLogStore.Filter> f = ArgumentCaptor.forClass(ActivityLogStore.Filter.class);
        verify(store).search(f.capture(), org.mockito.ArgumentMatchers.eq(0), org.mockito.ArgumentMatchers.eq(200));
        assertThat(f.getValue().source()).isEqualTo("BOT");
        assertThat(f.getValue().type()).isEqualTo("BROADCAST");
        assertThat(f.getValue().result()).isEqualTo("FAILED");
        assertThat(f.getValue().order()).isEqualTo("#1a2b3c4d");
        assertThat(f.getValue().q()).isEqualTo("vasya");
        // Kyiv is UTC+3 in October; "to" is inclusive → the start of the next day
        assertThat(f.getValue().from()).isEqualTo(Instant.parse("2026-09-30T21:00:00Z"));
        assertThat(f.getValue().to()).isEqualTo(Instant.parse("2026-10-07T21:00:00Z"));
        assertThat(first.totals()).containsEntry("OK", 3L);

        ActivityLogController.Page second = controller.list(1, 50, null, null, null, null, null, null, null,
                null, null, null, null);
        assertThat(second.totals()).isNull();
        verify(store).countByResult(any());
    }

    @Test
    void badDateIsA400() {
        assertThatThrownBy(() -> controller.list(0, 50, null, null, null, null, null, null, null, null, null,
                "07.10.2026", null)).isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void statsAreGroupedBySource() {
        when(store.countsSince(any())).thenReturn(List.of(
                new Object[]{"BOT", "OK", 10L}, new Object[]{"BOT", "FAILED", 2L}, new Object[]{"SITE", "OK", 4L}));

        Map<String, Map<String, Long>> stats = controller.stats(24);

        assertThat(stats.get("BOT")).containsEntry("total", 12L).containsEntry("failed", 2L).containsEntry("ok", 10L);
        assertThat(stats.get("SITE")).containsEntry("total", 4L);
    }

    @Test
    void retentionNeverGoesBelowAWeek() {
        ActivityLogRetentionJob r = new ActivityLogRetentionJob(store, 1, 1095, java.time.Clock.systemUTC());
        assertThat(r.retentionDays()).isEqualTo(7);
        r.purge();
        verify(store).purgeBefore(any());
        verify(store).purgeMoneyBefore(any());
        verify(store, never()).search(any(), anyInt(), anyInt());
    }
}
