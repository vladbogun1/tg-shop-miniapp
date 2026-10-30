package com.maxsolch.shop.notification.app;

import com.maxsolch.shop.notification.domain.Broadcast;
import com.maxsolch.shop.notification.infra.BroadcastRepository;
import com.maxsolch.shop.journal.app.JournalFeed;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BroadcastDeliveryReportTest {

    private final JournalFeed store = mock(JournalFeed.class);
    private final BroadcastRepository broadcasts = mock(BroadcastRepository.class);
    private final BroadcastDeliveryReport report = new BroadcastDeliveryReport(broadcasts, store);

    @Test
    void broadcastSummaryCountsDeliveredFailedAndReasons() {
        Broadcast b = new Broadcast();
        b.setId(12L);
        b.setText("Акция");
        b.setAudience("all");
        b.setStatus(Broadcast.DONE);
        b.setTotal(10);
        b.setStartedAt(Instant.now());
        when(broadcasts.recent(any())).thenReturn(List.of(b));
        Map<String, Long> counts = new LinkedHashMap<>();
        counts.put("OK", 6L);
        counts.put("FAILED|BOT_BLOCKED", 3L);
        counts.put("FAILED|RATE_LIMITED", 1L);
        when(store.groupBreakdown(anyList())).thenReturn(Map.of("broadcast:12", counts));

        List<BroadcastDeliveryReport.Summary> out = report.recent(20);

        assertThat(out).hasSize(1);
        BroadcastDeliveryReport.Summary s = out.get(0);
        assertThat(s.group()).isEqualTo("broadcast:12");
        assertThat(s.delivered()).isEqualTo(6);
        assertThat(s.failed()).isEqualTo(4);
        assertThat(s.reasons()).containsEntry("BOT_BLOCKED", 3L).containsEntry("RATE_LIMITED", 1L);
        verify(store).groupBreakdown(List.of("broadcast:12"));
    }

    @Test
    void broadcastsOlderThanTheJournalHaveNoBreakdown() {
        Broadcast b = new Broadcast();
        b.setId(1L);
        BroadcastDeliveryReport.Summary s = BroadcastDeliveryReport.summary(
                BroadcastHistoryDto.of(b), "broadcast:1", Map.of());
        assertThat(s.delivered()).isZero();
        assertThat(s.reasons()).isEmpty();
    }

}
