package com.maxsolch.shop.journal.api;

import com.maxsolch.shop.journal.app.ActivityLog;
import com.maxsolch.shop.journal.app.ActivityLogRetentionJob;
import com.maxsolch.shop.journal.app.JournalFeed;
import com.maxsolch.shop.journal.domain.ActivityFeed;
import java.time.Clock;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import com.maxsolch.shop.platform.time.ShopZone;
import org.springframework.lang.Nullable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.DateTimeException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static com.maxsolch.shop.platform.util.Texts.trimToNull;

/**
 * «Журнал → Бот и сайт»: what the bot sent (delivered or not, and why), what customers did on the
 * website and in the Mini App, payments and background jobs ({@code activity_log}, V47).
 * Read-only, admins only.
 *
 * <p>Filters (all optional): {@code source}, {@code type}, {@code result}, {@code recipient},
 * {@code tgUserId}, {@code order} (UUID or the short 8-char id), {@code group}
 * ({@code broadcast:<id>}), {@code errorCode}, {@code q} (text / @username / name / telegram id),
 * {@code from}/{@code to} — calendar days {@code yyyy-MM-dd} in the shop timezone, {@code to}
 * inclusive.
 */
@RestController
@RequestMapping("/api/admin/activity")
@RequiredAdmin
@Tag(name = "Admin Activity", description = "Bot / site / Mini App / payment events")
@SecurityRequirement(name = "bearer-jwt")
public class ActivityLogController {

    private final JournalFeed store;
    private final ActivityLogRetentionJob retention;
    private final ShopZone shopZone;
    private final Clock clock;

    public ActivityLogController(JournalFeed store,
                                 ActivityLogRetentionJob retention,
                                 ShopZone shopZone,
                                 Clock clock) {
        this.clock = clock;
        this.store = store;
        this.retention = retention;
        this.shopZone = shopZone;
    }

    /** A page of the feed; {@code totals} (by result, whole filter) only on the first page. */
    public record Page(List<ActivityFeed.Row> items, @Nullable Map<String, Long> totals) {
    }

    /** One (source, type) pair seen in the journal, for the type dropdown. */
    public record TypeFacet(String source, String type) {
    }

    /** What the filter dropdowns offer. */
    public record Facets(List<TypeFacet> types, List<String> errorCodes, int retentionDays) {
    }

    @GetMapping
    @Operation(summary = "Bot / site / Mini App / payment events, newest first, with optional filters")
    public Page list(@RequestParam(defaultValue = "0") int page,
                     @RequestParam(defaultValue = "50") int size,
                     @RequestParam(required = false) String source,
                     @RequestParam(required = false) String type,
                     @RequestParam(required = false) String result,
                     @RequestParam(required = false) String recipient,
                     @RequestParam(required = false) Long tgUserId,
                     @RequestParam(required = false) String order,
                     @RequestParam(required = false) String group,
                     @RequestParam(required = false) String errorCode,
                     @RequestParam(required = false) String q,
                     @RequestParam(required = false) String from,
                     @RequestParam(required = false) String to) {
        int capped = Math.min(Math.max(1, size), 200);
        int p = Math.max(0, page);
        ActivityFeed.Filter f = new ActivityFeed.Filter(
                upper(source), upper(type), upper(result), upper(recipient), tgUserId,
                trimToNull(order), trimToNull(group), upper(errorCode), trimToNull(q),
                shopZone.day(from, false), shopZone.day(to, true));
        List<ActivityFeed.Row> items = store.search(f, p, capped);
        return new Page(items, p == 0 ? store.countByResult(f) : null);
    }

    @GetMapping("/facets")
    @Operation(summary = "Event types (per source) and failure reasons seen, for the filter dropdowns")
    public Facets facets() {
        List<TypeFacet> types = store.sourceTypes().stream().map(r -> new TypeFacet(r[0], r[1])).toList();
        return new Facets(types, store.errorCodes(), retention.retentionDays());
    }

    @GetMapping("/stats")
    @Operation(summary = "Counters of the last N hours (default 24) per source: total / failed / skipped")
    public Map<String, Map<String, Long>> stats(@RequestParam(defaultValue = "24") int hours) {
        int h = Math.min(Math.max(1, hours), 24 * 31);
        Map<String, Map<String, Long>> out = new LinkedHashMap<>();
        for (Object[] r : store.countsSince(clock.instant().minus(Duration.ofHours(h)))) {
            Map<String, Long> m = out.computeIfAbsent((String) r[0], k -> new LinkedHashMap<>());
            m.merge("total", (Long) r[2], Long::sum);
            m.merge(((String) r[1]).toLowerCase(Locale.ROOT), (Long) r[2], Long::sum);
        }
        return out;
    }

    // ------------------------------------------------------------------ helpers

    private static String upper(String s) {
        String v = trimToNull(s);
        return v == null ? null : v.toUpperCase(Locale.ROOT);
    }
}
