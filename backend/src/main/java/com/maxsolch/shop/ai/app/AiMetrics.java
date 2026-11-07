package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.app.AiMetricsDtos.MonthSpend;
import com.maxsolch.shop.ai.app.AiMetricsDtos.Row;
import com.maxsolch.shop.ai.app.AiMetricsDtos.Series;
import com.maxsolch.shop.ai.app.AiMetricsDtos.Summary;
import com.maxsolch.shop.ai.app.AiMetricsDtos.Waiting;
import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiMoney;
import com.maxsolch.shop.ai.domain.JobFact;
import com.maxsolch.shop.ai.infra.AiMetricsQueries;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.time.ShopZone;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;

/**
 * The numbers of the «ИИ» tab of the metrics, for the finance right. They come from the totals every job wrote when
 * it ended ({@link AiMetricsQueries#facts}), not from the line-by-line journal; the journal is read only for the
 * per-provider breakdown and for the month's spend (the same sum the limits use). Runs of the technical admin are left
 * out unless {@code withTest} is set. Dates are shop days, both ends included; no dates = the current month so far.
 */
@Service
public class AiMetrics {

    /** The technical admin (claude-tech): the tests and the admin-API checks of the sessions, not real work. */
    public static final long TEST_ADMIN = 9_000_000_000_000_001L;

    static final int MAX_DAYS = 366;
    static final Duration STALE = Duration.ofDays(14);
    static final Duration FORECAST_AFTER = Duration.ofDays(3);

    private final AiMetricsQueries queries;
    private final AiLimits limits;
    private final AiPolicy policy;
    private final Clock clock;
    private final ShopZone zone;

    public AiMetrics(AiMetricsQueries queries, AiLimits limits, AiPolicy policy, Clock clock, ShopZone zone) {
        this.queries = queries;
        this.limits = limits;
        this.policy = policy;
        this.clock = clock;
        this.zone = zone;
    }

    private record Range(LocalDate from, LocalDate to) {
        Instant start(ShopZone z) {
            return z.day(from.toString(), false);
        }

        Instant end(ShopZone z) {
            return z.day(to.toString(), true);
        }
    }

    @Transactional(readOnly = true)
    public Summary summary(String from, String to, boolean withTest) {
        Range r = range(from, to);
        Long skip = withTest ? null : TEST_ADMIN;
        List<JobFact> facts = queries.facts(r.start(zone), r.end(zone), skip);
        List<JobFact> builtin = AiMetricsCalc.builtin(facts);
        long spent = AiMetricsCalc.spentMinor(builtin);
        long accepted = AiMetricsCalc.accepted(builtin);
        Instant now = clock.instant();
        var w = queries.waiting(now.minus(STALE), skip);
        Waiting waiting = new Waiting(w.count(), w.oldest() == null ? null : (int) Duration.between(w.oldest(), now).toDays(),
                w.stale());
        return new Summary(r.from().toString(), r.to().toString(), month(), spent, accepted,
                accepted == 0 ? null : Math.ceilDiv(spent, accepted), AiMetricsCalc.share(facts),
                AiMetricsCalc.noEdits(builtin), waiting, AiMetricsCalc.wastedMinor(builtin),
                AiMetricsCalc.wasteRows(builtin), AiMetricsCalc.fastApply(builtin));
    }

    @Transactional(readOnly = true)
    public Series series(String groupBy, String from, String to, boolean withTest) {
        Range r = range(from, to);
        Long skip = withTest ? null : TEST_ADMIN;
        String by = groupBy == null ? "" : groupBy.trim().toLowerCase(Locale.ROOT);
        return switch (by) {
            case "day" -> new Series(by, AiMetricsCalc.byDay(
                    AiMetricsCalc.builtin(queries.facts(r.start(zone), r.end(zone), skip)), r.from(), r.to(), zone.zone()));
            case "feature" -> new Series(by, AiMetricsCalc.byFeature(
                    AiMetricsCalc.builtin(queries.facts(r.start(zone), r.end(zone), skip))));
            case "provider" -> new Series(by, providers(r, skip));
            default -> throw new DomainException.BadRequest(AiError.BAD_REQUEST, "groupBy");
        };
    }

    private List<Row> providers(Range r, Long skip) {
        int rate = policy.rateMilli();
        return queries.providers(r.start(zone), r.end(zone), skip).stream()
                .map(p -> new Row(p.provider(), p.kind(), p.calls(), 0, p.failed(),
                        AiMoney.costMinor(p.costMicroUsd(), rate), 0, p.inputTokens(), p.outputTokens()))
                .toList();
    }

    /** The month against its limit and the forecast; the same sums as «Состояние» in the settings. */
    private MonthSpend month() {
        long spentMicro = limits.spend().monthMicroUsd();
        long limitMicro = policy.monthLimitMicro();
        int rate = policy.rateMilli();
        ZonedDateTime now = zone.now(clock);
        ZonedDateTime start = now.withDayOfMonth(1).truncatedTo(ChronoUnit.DAYS);
        long forecast = forecastMicro(spentMicro, Duration.between(start, now), Duration.between(start, start.plusMonths(1)));
        return new MonthSpend(AiMoney.costMinor(spentMicro, rate), AiMoney.costMinor(limitMicro, rate),
                AiMetricsCalc.percent(spentMicro, limitMicro),
                forecast < 0 ? null : AiMoney.costMinor(forecast, rate), policy.serperUsed(), AiPolicy.SERPER_FREE);
    }

    /** The spend scaled to the whole month: an estimate, and none (-1) in the first days or with nothing spent. */
    static long forecastMicro(long spentMicro, Duration elapsed, Duration month) {
        if (spentMicro <= 0 || elapsed.compareTo(FORECAST_AFTER) < 0 || elapsed.isZero()) {
            return -1;
        }
        double scaled = (double) spentMicro * month.toMillis() / elapsed.toMillis();
        return Math.max(spentMicro, Math.round(scaled));
    }

    private Range range(String from, String to) {
        LocalDate today = zone.today(clock);
        LocalDate a = from == null || from.isBlank() ? today.withDayOfMonth(1) : parse(from);
        LocalDate b = to == null || to.isBlank() ? today : parse(to);
        if (b.isBefore(a) || ChronoUnit.DAYS.between(a, b) >= MAX_DAYS) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "period");
        }
        return new Range(a, b);
    }

    private static LocalDate parse(String s) {
        try {
            return LocalDate.parse(s.trim());
        } catch (java.time.format.DateTimeParseException e) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "date");
        }
    }
}
