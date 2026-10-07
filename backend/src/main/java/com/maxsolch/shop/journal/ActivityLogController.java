package com.maxsolch.shop.journal;

import com.maxsolch.shop.repository.BroadcastRepository;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.dto.BroadcastHistoryDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.DateTimeException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

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

    private final ActivityLogStore store;
    private final BroadcastRepository broadcasts;
    private final ActivityLogRetention retention;
    private final ZoneId zone;

    public ActivityLogController(ActivityLogStore store, BroadcastRepository broadcasts,
                                 ActivityLogRetention retention,
                                 @Value("${app.timezone:Europe/Kyiv}") String timezone) {
        this.store = store;
        this.broadcasts = broadcasts;
        this.retention = retention;
        ZoneId z;
        try {
            z = ZoneId.of(timezone);
        } catch (DateTimeException e) {
            z = ZoneId.of("Europe/Kyiv");
        }
        this.zone = z;
    }

    /** A page of the feed; {@code totals} (by result, whole filter) only on the first page. */
    public record Page(List<ActivityLogStore.Row> items, Map<String, Long> totals) {
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
        ActivityLogStore.Filter f = new ActivityLogStore.Filter(
                upper(source), upper(type), upper(result), upper(recipient), tgUserId,
                blankToNull(order), blankToNull(group), upper(errorCode), blankToNull(q),
                day(from, false), day(to, true));
        List<ActivityLogStore.Row> items = store.search(f, p, capped);
        return new Page(items, p == 0 ? store.countByResult(f) : null);
    }

    @GetMapping("/facets")
    @Operation(summary = "Event types (per source) and failure reasons seen, for the filter dropdowns")
    public Map<String, Object> facets() {
        List<Map<String, String>> types = store.sourceTypes().stream()
                .map(r -> Map.of("source", r[0], "type", r[1]))
                .toList();
        return Map.of(
                "types", types,
                "errorCodes", store.errorCodes(),
                "retentionDays", retention.retentionDays());
    }

    @GetMapping("/stats")
    @Operation(summary = "Counters of the last N hours (default 24) per source: total / failed / skipped")
    public Map<String, Map<String, Long>> stats(@RequestParam(defaultValue = "24") int hours) {
        int h = Math.min(Math.max(1, hours), 24 * 31);
        Map<String, Map<String, Long>> out = new LinkedHashMap<>();
        for (Object[] r : store.countsSince(Instant.now().minus(Duration.ofHours(h)))) {
            Map<String, Long> m = out.computeIfAbsent((String) r[0], k -> new LinkedHashMap<>());
            m.merge("total", (Long) r[2], Long::sum);
            m.merge(((String) r[1]).toLowerCase(Locale.ROOT), (Long) r[2], Long::sum);
        }
        return out;
    }

    /** A broadcast with its per-recipient delivery breakdown from the journal. */
    public record BroadcastSummary(BroadcastHistoryDto broadcast, String group, long delivered, long failed,
                                   long skipped, Map<String, Long> reasons) {
    }

    @GetMapping("/broadcasts")
    @Operation(summary = "Recent broadcasts with delivered / not delivered counts and the reasons")
    public List<BroadcastSummary> broadcasts(@RequestParam(defaultValue = "20") int limit) {
        List<BroadcastHistoryDto> recent = broadcasts.recent(PageRequest.of(0, Math.min(Math.max(1, limit), 100)))
                .stream().map(BroadcastHistoryDto::of).toList();
        List<String> groups = recent.stream().map(b -> ActivityLog.broadcastGroup(b.id())).toList();
        Map<String, Map<String, Long>> breakdown = store.groupBreakdown(groups);
        List<BroadcastSummary> out = new ArrayList<>(recent.size());
        for (BroadcastHistoryDto b : recent) {
            String g = ActivityLog.broadcastGroup(b.id());
            out.add(summary(b, g, breakdown.getOrDefault(g, Map.of())));
        }
        return out;
    }

    /** {"OK": 10, "FAILED|BOT_BLOCKED": 3, "FAILED|RATE_LIMITED": 1} → counts + reasons. */
    static BroadcastSummary summary(BroadcastHistoryDto b, String group, Map<String, Long> counts) {
        long ok = 0, failed = 0, skipped = 0;
        Map<String, Long> reasons = new LinkedHashMap<>();
        for (Map.Entry<String, Long> e : counts.entrySet()) {
            String[] parts = e.getKey().split("\\|", 2);
            switch (parts[0]) {
                case ActivityLog.OK -> ok += e.getValue();
                case ActivityLog.FAILED -> failed += e.getValue();
                default -> skipped += e.getValue();
            }
            if (!ActivityLog.OK.equals(parts[0])) {
                reasons.merge(parts.length > 1 ? parts[1] : "ERROR", e.getValue(), Long::sum);
            }
        }
        return new BroadcastSummary(b, group, ok, failed, skipped, reasons);
    }

    // ------------------------------------------------------------------ helpers

    /** Start of the day ({@code to}: start of the NEXT day, so the given day is included). */
    private Instant day(String value, boolean endExclusive) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            LocalDate d = LocalDate.parse(value.trim());
            return (endExclusive ? d.plusDays(1) : d).atStartOfDay(zone).toInstant();
        } catch (DateTimeParseException e) {
            throw new BadRequestException("date must be yyyy-MM-dd");
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static String upper(String s) {
        String v = blankToNull(s);
        return v == null ? null : v.toUpperCase(Locale.ROOT);
    }
}
