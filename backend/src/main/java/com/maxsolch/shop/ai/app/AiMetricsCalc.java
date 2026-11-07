package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.app.AiMetricsDtos.FastApply;
import com.maxsolch.shop.ai.app.AiMetricsDtos.NoEdits;
import com.maxsolch.shop.ai.app.AiMetricsDtos.Row;
import com.maxsolch.shop.ai.app.AiMetricsDtos.Share;
import com.maxsolch.shop.ai.app.AiMetricsDtos.WasteRow;
import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.JobFact;
import com.maxsolch.shop.ai.domain.JobPath;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.ai.domain.ManualReason;

import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * The arithmetic of the AI metrics over the finished jobs of a period, pure (no database, no clock): the share of the
 * built-in way, the two «без правок» numbers, the money spent in vain, the days of the chart. The money of a job is
 * {@code micro-USD x the rate fixed on that job}, summed first and turned into kopecks once (rounded up), so a stream
 * of cheap jobs does not gather a rounding error per job.
 */
final class AiMetricsCalc {

    /** A line of «Зря потрачено»; the first four are the misses of the AI itself, the last two are not. */
    enum Waste {
        NODATA(true), FAILED(true), LOST(true), RETRIED(true), REJECTED(false), CANCELED(false);

        final boolean counted;

        Waste(boolean counted) {
            this.counted = counted;
        }
    }

    static final Duration FAST = Duration.ofSeconds(5);
    static final int FAST_MIN_FIELDS = 10;
    private static final long WEIGHT_PER_KOPECK = 10_000_000L;

    private AiMetricsCalc() {
    }

    /** Micro-USD x rate (UAH per USD x 1000), summable; {@link #minor} turns it into kopecks. */
    static final class Money {
        private long weighted;

        void add(JobFact f) {
            weighted += f.costMicroUsd() * f.rateMilli();
        }

        long minor() {
            return weighted <= 0 ? 0 : Math.ceilDiv(weighted, WEIGHT_PER_KOPECK);
        }
    }

    static Integer percent(long part, long whole) {
        return whole <= 0 ? null : (int) Math.round(100.0 * part / whole);
    }

    static List<JobFact> builtin(List<JobFact> facts) {
        return facts.stream().filter(f -> f.path() == JobPath.BUILTIN).toList();
    }

    static long spentMinor(List<JobFact> builtin) {
        Money m = new Money();
        builtin.forEach(m::add);
        return m.minor();
    }

    static long accepted(List<JobFact> builtin) {
        return builtin.stream().filter(JobFact::accepted).count();
    }

    /** Applications by the built-in AI against marks of the manual way, and the reasons of the latter. */
    static Share share(List<JobFact> facts) {
        long builtin = facts.stream().filter(f -> f.path() == JobPath.BUILTIN && f.accepted()).count();
        Map<String, Long> by = new LinkedHashMap<>();
        for (ManualReason r : ManualReason.values()) {
            by.put(r.name(), 0L);
        }
        long manual = 0;
        for (JobFact f : facts) {
            if (f.path() == JobPath.MANUAL) {
                manual++;
                String reason = f.errorCode() != null && by.containsKey(f.errorCode())
                        ? f.errorCode() : ManualReason.CHOICE.name();
                by.merge(reason, 1L, Long::sum);
            }
        }
        return new Share(builtin, manual, percent(builtin, builtin + manual), by);
    }

    /**
     * Of the results somebody decided on (applied or rejected): the fields taken without a change out of the fields the
     * AI proposed (applied + rejected; a field under a lock was never proposed), and the products taken whole without
     * a change out of all decided. A result nobody has opened is counted apart ({@code notOpened}), not as «with edits».
     */
    static NoEdits noEdits(List<JobFact> builtin) {
        long proposed = 0;
        long clean = 0;
        long decided = 0;
        long whole = 0;
        long notOpened = 0;
        for (JobFact f : builtin) {
            if (f.outcome() == null) {
                if (f.status() == JobStatus.DONE) {
                    notOpened++;
                }
                continue;
            }
            decided++;
            proposed += f.applied() + f.rejected();
            clean += Math.max(0, f.applied() - f.edited());
            if (f.applied() > 0 && f.rejected() == 0 && f.edited() == 0) {
                whole++;
            }
        }
        return new NoEdits(percent(clean, proposed), percent(whole, decided), decided, notOpened);
    }

    /** Which line of the waste the job belongs to; null for a job that was not in vain. */
    static Waste waste(JobFact f) {
        if (f.status() == JobStatus.EMPTY) {
            return Waste.NODATA;
        }
        if (f.status() == JobStatus.FAILED && AiError.RESTARTED.name().equals(f.errorCode())) {
            return Waste.LOST;
        }
        if (f.status() == JobStatus.FAILED || f.status() == JobStatus.BAD_ANSWER) {
            return Waste.FAILED;
        }
        boolean over = f.status() == JobStatus.DONE || f.status() == JobStatus.CANCELED;
        if (over && f.retried()) {
            return Waste.RETRIED;
        }
        if (f.status() == JobStatus.CANCELED) {
            return Waste.CANCELED;
        }
        return "REJECTED".equals(f.outcome()) ? Waste.REJECTED : null;
    }

    /** The lines of «Зря потрачено»; a line is shown when it has a job. */
    static List<WasteRow> wasteRows(List<JobFact> builtin) {
        Map<Waste, Money> sums = new EnumMap<>(Waste.class);
        Map<Waste, Long> jobs = new EnumMap<>(Waste.class);
        for (JobFact f : builtin) {
            Waste w = waste(f);
            if (w != null) {
                sums.computeIfAbsent(w, k -> new Money()).add(f);
                jobs.merge(w, 1L, Long::sum);
            }
        }
        List<WasteRow> rows = new ArrayList<>();
        for (Waste w : Waste.values()) {
            if (jobs.containsKey(w)) {
                rows.add(new WasteRow(w.name(), jobs.get(w), sums.get(w).minor(), w.counted));
            }
        }
        return rows;
    }

    static long wastedMinor(List<JobFact> builtin) {
        Money m = new Money();
        builtin.stream().filter(f -> {
            Waste w = waste(f);
            return w != null && w.counted;
        }).forEach(m::add);
        return m.minor();
    }

    static FastApply fastApply(List<JobFact> builtin) {
        long of = 0;
        long fast = 0;
        for (JobFact f : builtin) {
            if (f.accepted() && f.applied() >= FAST_MIN_FIELDS) {
                of++;
                if (f.outcomeAt() != null && f.finishedAt() != null
                        && Duration.between(f.finishedAt(), f.outcomeAt()).compareTo(FAST) < 0) {
                    fast++;
                }
            }
        }
        return new FastApply(fast, of);
    }

    /** Money per shop day for the chart: every day of the range, empty days with zeros. */
    static List<Row> byDay(List<JobFact> builtin, LocalDate from, LocalDate to, ZoneId zone) {
        Map<LocalDate, List<JobFact>> days = new TreeMap<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            days.put(d, new ArrayList<>());
        }
        for (JobFact f : builtin) {
            List<JobFact> day = days.get(f.finishedAt().atZone(zone).toLocalDate());
            if (day != null) {
                day.add(f);
            }
        }
        List<Row> rows = new ArrayList<>();
        days.forEach((d, list) -> rows.add(row(d.toString(), null, list)));
        return rows;
    }

    static List<Row> byFeature(List<JobFact> builtin) {
        Map<String, List<JobFact>> by = new TreeMap<>();
        builtin.forEach(f -> by.computeIfAbsent(f.feature().name(), k -> new ArrayList<>()).add(f));
        List<Row> rows = new ArrayList<>();
        by.forEach((k, list) -> rows.add(row(k, null, list)));
        return rows;
    }

    private static Row row(String key, String kind, List<JobFact> jobs) {
        Money all = new Money();
        Money bad = new Money();
        long badCount = 0;
        for (JobFact f : jobs) {
            all.add(f);
            Waste w = waste(f);
            if (w != null && w.counted) {
                bad.add(f);
                badCount++;
            }
        }
        return new Row(key, kind, jobs.size(), jobs.stream().filter(JobFact::accepted).count(), badCount, all.minor(),
                bad.minor(), 0, 0);
    }
}
