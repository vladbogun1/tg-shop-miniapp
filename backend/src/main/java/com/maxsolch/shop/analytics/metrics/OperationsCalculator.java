package com.maxsolch.shop.analytics.metrics;

import com.maxsolch.shop.analytics.metrics.MetricsDtos.CountRow;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.ErrorRow;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Operations;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.RejectStats;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.SpeedRow;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Violation;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.OrderFact;
import com.maxsolch.shop.domain.OrderStatus;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;

/** The "Операции" tab: processing speed (median/p90), stuck orders, rejections, delivery/payment mix. */
public final class OperationsCalculator {

    /** Approved but not shipped for longer than this is flagged. */
    static final Duration APPROVED_TOO_LONG = Duration.ofHours(24);
    /** Shipped but not marked delivered for longer than this is flagged. */
    static final Duration SHIPPED_TOO_LONG = Duration.ofDays(7);
    static final String UNSPECIFIED = "UNSPECIFIED";
    private static final int VIOLATION_LIMIT = 30;
    private static final int TEXT_REASONS = 10;

    /** Labels of {@code orders.reject_reason_code} (package B's dictionary). */
    static final Map<String, String> REASON_LABELS = new LinkedHashMap<>();

    static {
        REASON_LABELS.put("NO_RESPONSE", "Не ответил");
        REASON_LABELS.put("CHANGED_MIND", "Передумал");
        REASON_LABELS.put("OUT_OF_STOCK", "Нет в наличии");
        REASON_LABELS.put("DUPLICATE", "Дубль");
        REASON_LABELS.put("NOT_PAID", "Не оплатил");
        REASON_LABELS.put("REFUSED_AT_POST", "Отказ на почте");
        REASON_LABELS.put("RETURNED", "Возврат");
        REASON_LABELS.put("OTHER", "Другое");
        REASON_LABELS.put(UNSPECIFIED, "Не указано");
    }

    public Operations compute(MetricsFacts facts, MetricsPeriod period, ChannelFilter channel,
                              boolean reasonCodes, List<ErrorRow> clientErrors) {
        List<OrderFact> inPeriod = facts.orders().stream()
                .filter(o -> channel.matches(o.source()) && period.contains(o.createdAt()))
                .toList();

        List<SpeedRow> speed = List.of(
                speed("approve", "До одобрения", inPeriod, OrderFact::createdAt, OrderFact::approvedAt, null),
                speed("ship", "От одобрения до отправки", inPeriod, OrderFact::approvedAt, OrderFact::shippedAt, null),
                speed("deliver", "От отправки до «Доставлен»", inPeriod, OrderFact::shippedAt, OrderFact::deliveredAt,
                        "По отметке админа, а не по факту получения на почте"),
                speed("total", "Полный цикл", inPeriod, OrderFact::createdAt, OrderFact::deliveredAt,
                        "От заказа до отметки «Доставлен»"));

        Instant now = facts.now();
        List<Violation> approved = new ArrayList<>();
        List<Violation> shipped = new ArrayList<>();
        for (OrderFact o : facts.orders()) {
            if (!channel.matches(o.source())) {
                continue;
            }
            if (o.status() == OrderStatus.APPROVED && o.approvedAt() != null
                    && Duration.between(o.approvedAt(), now).compareTo(APPROVED_TOO_LONG) > 0) {
                approved.add(violation(o, o.approvedAt(), now));
            }
            if (o.status() == OrderStatus.SHIPPED && o.shippedAt() != null
                    && Duration.between(o.shippedAt(), now).compareTo(SHIPPED_TOO_LONG) > 0) {
                shipped.add(violation(o, o.shippedAt(), now));
            }
        }
        Comparator<Violation> longest = Comparator.comparingDouble(Violation::hours).reversed();
        approved.sort(longest);
        shipped.sort(longest);

        return new Operations(MetricsDtos.PeriodInfo.of(period, channel), speed,
                approved.size() > VIOLATION_LIMIT ? approved.subList(0, VIOLATION_LIMIT) : approved,
                shipped.size() > VIOLATION_LIMIT ? shipped.subList(0, VIOLATION_LIMIT) : shipped,
                rejects(inPeriod, reasonCodes),
                counts(inPeriod, o -> o.deliveryMethod()),
                counts(inPeriod, o -> o.paymentOptionTitle()),
                clientErrors == null ? List.of() : clientErrors);
    }

    private static Violation violation(OrderFact o, Instant since, Instant now) {
        return new Violation(o.id(), o.customerName(), since,
                Stats.round1(Duration.between(since, now).toMinutes() / 60.0), o.totalMinor());
    }

    static SpeedRow speed(String key, String label, List<OrderFact> orders, Function<OrderFact, Instant> start,
                          Function<OrderFact, Instant> end, String note) {
        List<Double> hours = new ArrayList<>();
        for (OrderFact o : orders) {
            Instant s = start.apply(o);
            Instant e = end.apply(o);
            if (s != null && e != null && !e.isBefore(s)) {
                hours.add(Duration.between(s, e).toMinutes() / 60.0);
            }
        }
        return new SpeedRow(key, label, Stats.round2(Stats.median(hours)), Stats.round2(Stats.percentile(hours, 90)),
                hours.size(), note);
    }

    RejectStats rejects(List<OrderFact> inPeriod, boolean reasonCodes) {
        long rejected = 0;
        long afterShipping = 0;
        long paidNotRefunded = 0;
        long paidNotRefundedMinor = 0;
        Map<String, Long> byKey = new HashMap<>();
        for (OrderFact o : inPeriod) {
            if (!o.rejected()) {
                continue;
            }
            rejected++;
            if (o.shippedAt() != null) {
                afterShipping++;
            }
            long kept = o.receivedMinor() - o.refundedMinor();
            if (kept > 0) {
                paidNotRefunded++;
                paidNotRefundedMinor += kept;
            }
            String key = reasonCodes
                    ? (o.rejectReasonCode() == null || o.rejectReasonCode().isBlank() ? UNSPECIFIED : o.rejectReasonCode())
                    : normaliseText(o.rejectReason());
            byKey.merge(key, 1L, Long::sum);
        }
        List<CountRow> rows = new ArrayList<>();
        if (reasonCodes) {
            byKey.forEach((k, v) -> rows.add(new CountRow(k, REASON_LABELS.getOrDefault(k, k), v)));
            rows.sort(Comparator.comparingLong(CountRow::count).reversed());
        } else {
            // Before the reason dictionary existed: the most common free-text reasons, the rest folded.
            List<Map.Entry<String, Long>> sorted = new ArrayList<>(byKey.entrySet());
            sorted.sort(Map.Entry.<String, Long>comparingByValue().reversed());
            long other = 0;
            for (int i = 0; i < sorted.size(); i++) {
                Map.Entry<String, Long> e = sorted.get(i);
                if (i < TEXT_REASONS || e.getKey().equals(UNSPECIFIED)) {
                    rows.add(new CountRow(e.getKey(),
                            e.getKey().equals(UNSPECIFIED) ? REASON_LABELS.get(UNSPECIFIED) : e.getKey(), e.getValue()));
                } else {
                    other += e.getValue();
                }
            }
            if (other > 0) {
                rows.add(new CountRow("OTHER_TEXT", "Прочие формулировки", other));
            }
        }
        long total = inPeriod.size();
        return new RejectStats(rejected, total, total == 0 ? 0 : Stats.round1(rejected * 100.0 / total), reasonCodes,
                rows, afterShipping, paidNotRefunded, paidNotRefundedMinor);
    }

    /** Free-text reason as a grouping key: lower-cased, trimmed, no punctuation; blanks are "unspecified". */
    static String normaliseText(String reason) {
        if (reason == null) {
            return UNSPECIFIED;
        }
        String s = reason.toLowerCase(Locale.ROOT)
                .replaceAll("\\(\\p{L}{1,2}\\)", "") // "передумал(а)" -> "передумал"
                .replaceAll("[\\p{Punct}«»—–]+", " ")
                .replaceAll("\\s+", " ")
                .strip();
        return s.isEmpty() ? UNSPECIFIED : s.length() > 60 ? s.substring(0, 60) : s;
    }

    /** Counts by a field, with a "не указано" bucket instead of silently dropping nulls. */
    static List<CountRow> counts(List<OrderFact> orders, Function<OrderFact, String> field) {
        Map<String, Long> acc = new LinkedHashMap<>();
        for (OrderFact o : orders) {
            String v = field.apply(o);
            acc.merge(v == null || v.isBlank() ? UNSPECIFIED : v, 1L, Long::sum);
        }
        List<CountRow> out = new ArrayList<>();
        acc.forEach((k, v) -> out.add(new CountRow(k, k.equals(UNSPECIFIED) ? "Не указано" : k, v)));
        out.sort(Comparator.comparingLong(CountRow::count).reversed());
        return out;
    }
}
