package com.maxsolch.shop.journal.app;

import com.maxsolch.shop.journal.domain.ActivityFeed;
import com.maxsolch.shop.journal.infra.ActivityLogStore;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Reads of the journal for the admin screens (the feed, its filter values, counters, a broadcast's breakdown). */
@Service
public class JournalFeed {

    private final ActivityLogStore store;

    public JournalFeed(ActivityLogStore store) {
        this.store = store;
    }

    public List<ActivityFeed.Row> search(ActivityFeed.Filter filter, int page, int size) {
        return store.search(filter, page, size);
    }

    /** Rows of the whole filter by result. */
    public Map<String, Long> countByResult(ActivityFeed.Filter filter) {
        return store.countByResult(filter);
    }

    /** Distinct (source, type) pairs seen. */
    public List<String[]> sourceTypes() {
        return store.sourceTypes();
    }

    public List<String> errorCodes() {
        return store.errorCodes();
    }

    /** (source, result, count) since the moment. */
    public List<Object[]> countsSince(Instant since) {
        return store.countsSince(since);
    }

    /** Per broadcast group: {"OK": n, "FAILED|reason": n}. */
    public Map<String, Map<String, Long>> groupBreakdown(List<String> groupIds) {
        return store.groupBreakdown(groupIds);
    }
}
