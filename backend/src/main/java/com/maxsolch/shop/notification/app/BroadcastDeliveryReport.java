package com.maxsolch.shop.notification.app;

import com.maxsolch.shop.notification.infra.BroadcastRepository;
import com.maxsolch.shop.platform.journal.ActivityLog;
import com.maxsolch.shop.platform.journal.ActivityLogStore;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** «Журнал → Рассылки»: recent broadcasts with how many recipients got them and why the rest did not. */
@Service
public class BroadcastDeliveryReport {

    /** A broadcast with its per-recipient delivery breakdown from the journal. */
    public record Summary(BroadcastHistoryDto broadcast, String group, long delivered, long failed,
                          long skipped, Map<String, Long> reasons) {
    }

    private final BroadcastRepository broadcasts;
    private final ActivityLogStore journal;

    public BroadcastDeliveryReport(BroadcastRepository broadcasts, ActivityLogStore journal) {
        this.broadcasts = broadcasts;
        this.journal = journal;
    }

    @Transactional(readOnly = true)
    public List<Summary> recent(int limit) {
        List<BroadcastHistoryDto> recent = broadcasts.recent(PageRequest.of(0, Math.min(Math.max(1, limit), 100)))
                .stream().map(BroadcastHistoryDto::of).toList();
        List<String> groups = recent.stream().map(b -> ActivityLog.broadcastGroup(b.id())).toList();
        Map<String, Map<String, Long>> breakdown = journal.groupBreakdown(groups);
        List<Summary> out = new ArrayList<>(recent.size());
        for (BroadcastHistoryDto b : recent) {
            String g = ActivityLog.broadcastGroup(b.id());
            out.add(summary(b, g, breakdown.getOrDefault(g, Map.of())));
        }
        return out;
    }

    /** {"OK": 10, "FAILED|BOT_BLOCKED": 3, "FAILED|RATE_LIMITED": 1} → counts + reasons. */
    static Summary summary(BroadcastHistoryDto b, String group, Map<String, Long> counts) {
        long ok = 0, failed = 0, skipped = 0;
        Map<String, Long> reasons = new LinkedHashMap<>();
        for (Map.Entry<String, Long> e : counts.entrySet()) {
            String[] parts = e.getKey().split(java.util.regex.Pattern.quote("|"), 2);
            switch (parts[0]) {
                case ActivityLog.OK -> ok += e.getValue();
                case ActivityLog.FAILED -> failed += e.getValue();
                default -> skipped += e.getValue();
            }
            if (!ActivityLog.OK.equals(parts[0])) {
                reasons.merge(parts.length > 1 ? parts[1] : "ERROR", e.getValue(), Long::sum);
            }
        }
        return new Summary(b, group, ok, failed, skipped, reasons);
    }
}
