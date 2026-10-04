package com.maxsolch.shop.analytics.metrics;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Daily sales forecast that the owner can check by hand.
 *
 * <p>Model: <b>level × weekday factor</b>.
 * <ul>
 *   <li><b>Weekday factors</b> — average sales of each weekday over the last 12 weeks relative to the
 *       overall average, pulled halfway back to 1 (the shop's weekdays are fairly even; a single
 *       big Saturday must not become a rule).</li>
 *   <li><b>Level</b> — average daily sales of the last 28 days after removing the weekday effect, with
 *       the days above that window's 90th percentile capped at it: a single wholesale-size order should
 *       not lift the whole next month.</li>
 * </ul>
 * A trend term was tried and dropped: on this shop's history (sharp month-to-month swings) it made
 * the 30-day backtest worse, not better. The interval comes from the model's own backtest: every day
 * with at least 12 weeks of history before it is used as a forecast origin, the ratio actual/forecast
 * of the following 30 days is recorded, and its 10th–90th percentiles become the band.
 */
public final class ForecastModel {

    static final int LEVEL_DAYS = 28;
    static final int WEEKDAY_DAYS = 84;
    static final double WEEKDAY_SHRINK = 0.5;
    static final double CAP_PERCENTILE = 90;
    static final int HORIZON = 30;
    static final int MIN_HISTORY = 84;
    /** Out-of-sample coverage needs this many earlier backtests to estimate the band from. */
    static final int MIN_EARLIER = 20;

    /** Fitted parameters: level per day (minor units) and weekday factors (index 0 = Monday). */
    public record Fit(double level, double[] weekday) {
        public double predict(LocalDate day) {
            return level * weekday[day.getDayOfWeek().getValue() - 1];
        }
    }

    /**
     * @param ratios      actual / forecast of every backtest origin, in origin order
     * @param mape        mean absolute % error of the 30-day total
     * @param naiveMape   same for "next 30 days = last 30 days"
     * @param bias        mean signed % error (positive = forecast too high)
     * @param coveragePct share of origins whose actual fell in the band estimated from earlier origins
     */
    public record Backtest(List<Double> ratios, Double mape, Double naiveMape, Double bias, Double coveragePct,
                           double lowRatio, double highRatio) {
        public int count() {
            return ratios.size();
        }
    }

    private ForecastModel() {
    }

    /**
     * @param y        daily values, oldest first, the last one being the most recent full day
     * @param firstDay calendar date of {@code y[0]}
     */
    public static Fit fit(double[] y, LocalDate firstDay) {
        int n = y.length;
        double[] f = new double[7];
        Arrays.fill(f, 1.0);
        int from = Math.max(0, n - WEEKDAY_DAYS);
        double sum = 0;
        int cnt = 0;
        double[] dowSum = new double[7];
        int[] dowCnt = new int[7];
        for (int i = from; i < n; i++) {
            int dow = firstDay.plusDays(i).getDayOfWeek().getValue() - 1;
            dowSum[dow] += y[i];
            dowCnt[dow]++;
            sum += y[i];
            cnt++;
        }
        double mean = cnt == 0 ? 0 : sum / cnt;
        if (mean > 0) {
            double total = 0;
            for (int k = 0; k < 7; k++) {
                double raw = dowCnt[k] == 0 ? 1 : (dowSum[k] / dowCnt[k]) / mean;
                f[k] = 1 + WEEKDAY_SHRINK * (raw - 1);
                total += f[k];
            }
            for (int k = 0; k < 7; k++) {
                f[k] = f[k] / (total / 7);
            }
        }
        int lFrom = Math.max(0, n - LEVEL_DAYS);
        List<Double> window = new ArrayList<>();
        for (int i = lFrom; i < n; i++) {
            int dow = firstDay.plusDays(i).getDayOfWeek().getValue() - 1;
            window.add(f[dow] == 0 ? y[i] : y[i] / f[dow]);
        }
        double level = 0;
        if (!window.isEmpty()) {
            double cap = Stats.percentile(window, CAP_PERCENTILE);
            double s = 0;
            for (double v : window) {
                s += Math.min(v, cap);
            }
            level = s / window.size();
        }
        return new Fit(level, f);
    }

    /** Sum of the forecast for {@code days} consecutive days starting at {@code start}. */
    public static double total(Fit fit, LocalDate start, int days) {
        double s = 0;
        for (int h = 0; h < days; h++) {
            s += fit.predict(start.plusDays(h));
        }
        return s;
    }

    /** Rolling-origin backtest of the 30-day total (see the class comment). */
    public static Backtest backtest(double[] y, LocalDate firstDay) {
        List<Double> ratios = new ArrayList<>();
        double absErr = 0;
        double naiveErr = 0;
        double signed = 0;
        int used = 0;
        int covered = 0;
        int coverageTests = 0;
        for (int o = MIN_HISTORY; o + HORIZON <= y.length; o++) {
            double[] hist = Arrays.copyOfRange(y, 0, o);
            Fit fit = fit(hist, firstDay);
            double forecast = total(fit, firstDay.plusDays(o), HORIZON);
            double actual = 0;
            for (int h = 0; h < HORIZON; h++) {
                actual += y[o + h];
            }
            double last30 = 0;
            for (int i = Math.max(0, o - 30); i < o; i++) {
                last30 += y[i];
            }
            if (actual <= 0 || forecast <= 0) {
                continue;
            }
            if (ratios.size() >= MIN_EARLIER) {
                double lo = Stats.percentile(ratios, 10);
                double hi = Stats.percentile(ratios, 90);
                double r = actual / forecast;
                coverageTests++;
                if (r >= lo && r <= hi) {
                    covered++;
                }
            }
            ratios.add(actual / forecast);
            absErr += Math.abs(forecast - actual) / actual;
            naiveErr += Math.abs(last30 - actual) / actual;
            signed += (forecast - actual) / actual;
            used++;
        }
        if (used == 0) {
            return new Backtest(List.of(), null, null, null, null, 0.6, 1.6);
        }
        return new Backtest(ratios,
                Stats.round1(absErr / used * 100),
                Stats.round1(naiveErr / used * 100),
                Stats.round1(signed / used * 100),
                coverageTests == 0 ? null : Stats.round1(covered * 100.0 / coverageTests),
                Stats.percentile(ratios, 10),
                Stats.percentile(ratios, 90));
    }

    /**
     * Band for a horizon shorter than the backtested 30 days: relative error grows as the horizon
     * shrinks (fewer days to average out), roughly with 1/sqrt(days), capped at 2.5× the 30-day spread.
     */
    public static double[] band(double forecast, Backtest bt, int days) {
        double widen = Math.min(2.5, Math.sqrt((double) HORIZON / Math.max(5, days)));
        double lo = 1 - (1 - bt.lowRatio()) * widen;
        double hi = 1 + (bt.highRatio() - 1) * widen;
        return new double[]{Math.max(0, forecast * lo), forecast * hi};
    }
}
