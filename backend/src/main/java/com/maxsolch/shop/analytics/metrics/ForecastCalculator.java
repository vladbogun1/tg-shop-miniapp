package com.maxsolch.shop.analytics.metrics;

import com.maxsolch.shop.analytics.metrics.MetricsDtos.Accuracy;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Forecast;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.ForecastPoint;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.MonthForecast;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.RangeForecast;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.OrderFact;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;

/** Revenue ("sold") forecast for the current month and the next 30 days, with its backtest. */
public final class ForecastCalculator {

    static final int HISTORY_WEEKS = 10;
    static final int FORECAST_WEEKS = 5;

    static final String METHOD = "Прогноз = уровень × коэффициент дня недели. Уровень — средние продажи в день "
            + "за последние 28 дней (дни выше 90-го перцентиля обрезаются, чтобы один крупный заказ не задирал "
            + "весь месяц). Коэффициенты дней недели — за 12 недель, наполовину приглушены. Тренд не используется: "
            + "на истории магазина он ухудшал точность. Интервал — 10–90-й перцентили ошибок того же прогноза "
            + "на прошлых данных (бэктест).";

    private final ZoneId zone;

    public ForecastCalculator(ZoneId zone) {
        this.zone = zone;
    }

    /** Daily sold (not rejected, by creation day) from the first order day up to and including today. */
    record Daily(LocalDate first, double[] values) {
    }

    Daily daily(MetricsFacts facts, ChannelFilter channel, LocalDate today) {
        LocalDate first = null;
        for (OrderFact o : facts.orders()) {
            if (o.createdAt() != null && channel.matches(o.source())) {
                LocalDate d = LocalDate.ofInstant(o.createdAt(), zone);
                if (first == null || d.isBefore(first)) {
                    first = d;
                }
            }
        }
        if (first == null) {
            return new Daily(today, new double[]{0});
        }
        int n = (int) ChronoUnit.DAYS.between(first, today) + 1;
        double[] v = new double[Math.max(1, n)];
        for (OrderFact o : facts.orders()) {
            if (o.createdAt() == null || !o.sold() || !channel.matches(o.source())) {
                continue;
            }
            int i = (int) ChronoUnit.DAYS.between(first, LocalDate.ofInstant(o.createdAt(), zone));
            if (i >= 0 && i < v.length) {
                v[i] += o.soldMinor();
            }
        }
        return new Daily(first, v);
    }

    public Forecast compute(MetricsFacts facts, ChannelFilter channel) {
        LocalDate today = LocalDate.ofInstant(facts.now(), zone);
        Daily d = daily(facts, channel, today);
        double[] all = d.values();
        // Fit on full days only: today is still running.
        double[] full = java.util.Arrays.copyOf(all, Math.max(0, all.length - 1));
        double actualToday = all[all.length - 1];

        ForecastModel.Fit fit = ForecastModel.fit(full, d.first());
        ForecastModel.Backtest bt = ForecastModel.backtest(full, d.first());
        ForecastModel.Backtest btWeek = ForecastModel.backtest(full, d.first(), 7);

        // Next 30 days starting today (today's remaining part counts as a day).
        double next30 = ForecastModel.total(fit, today, ForecastModel.HORIZON);
        double[] band30 = ForecastModel.band(next30, btWeek, bt, ForecastModel.HORIZON);

        // This month: actual so far + forecast for the rest.
        YearMonth ym = YearMonth.from(today);
        LocalDate monthEnd = ym.atEndOfMonth();
        int daysAfterToday = (int) ChronoUnit.DAYS.between(today, monthEnd);
        double actualMonth = 0;
        LocalDate monthStart = ym.atDay(1);
        for (int i = 0; i < all.length; i++) {
            LocalDate day = d.first().plusDays(i);
            if (!day.isBefore(monthStart) && !day.isAfter(today)) {
                actualMonth += all[i];
            }
        }
        double remaining = ForecastModel.total(fit, today.plusDays(1), daysAfterToday)
                + Math.max(0, fit.predict(today) - actualToday);
        double[] bandRest = ForecastModel.band(remaining, btWeek, bt, daysAfterToday + 1);
        MonthForecast month = new MonthForecast(ym.toString(), Math.round(actualMonth), Math.round(remaining),
                Math.round(actualMonth + remaining), Math.round(actualMonth + bandRest[0]),
                Math.round(actualMonth + bandRest[1]), daysAfterToday + 1);

        // Weekly chart: actual weeks, then forecast weeks with the band (week = Monday..Sunday).
        LocalDate thisWeek = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        List<ForecastPoint> history = new ArrayList<>();
        for (int w = HISTORY_WEEKS; w >= 1; w--) {
            LocalDate ws = thisWeek.minusWeeks(w);
            double sum = 0;
            for (int i = 0; i < 7; i++) {
                int idx = (int) ChronoUnit.DAYS.between(d.first(), ws.plusDays(i));
                if (idx >= 0 && idx < all.length) {
                    sum += all[idx];
                }
            }
            history.add(new ForecastPoint(ws.toString(), Math.round(sum), null, null));
        }
        List<ForecastPoint> forecast = new ArrayList<>();
        for (int w = 0; w < FORECAST_WEEKS; w++) {
            LocalDate ws = thisWeek.plusWeeks(w);
            double actualPart = 0;
            double futurePart = 0;
            int futureDays = 0;
            for (int i = 0; i < 7; i++) {
                LocalDate day = ws.plusDays(i);
                if (day.isBefore(today)) {
                    int idx = (int) ChronoUnit.DAYS.between(d.first(), day);
                    actualPart += idx >= 0 && idx < all.length ? all[idx] : 0;
                } else if (day.equals(today)) {
                    actualPart += actualToday;
                    futurePart += Math.max(0, fit.predict(day) - actualToday);
                    futureDays++;
                } else {
                    futurePart += fit.predict(day);
                    futureDays++;
                }
            }
            // The band only covers what is still to come; the days already gone are facts.
            double[] b = ForecastModel.band(futurePart, btWeek, bt, Math.max(1, futureDays));
            forecast.add(new ForecastPoint(ws.toString(), Math.round(actualPart + futurePart),
                    Math.round(actualPart + b[0]), Math.round(actualPart + b[1])));
        }

        List<Double> factors = new ArrayList<>();
        for (double f : fit.weekday()) {
            factors.add(Stats.round2(f));
        }
        return new Forecast("sold", month,
                new RangeForecast(Math.round(next30), Math.round(band30[0]), Math.round(band30[1])),
                history, forecast, accuracy(bt), factors, METHOD);
    }

    static Accuracy accuracy(ForecastModel.Backtest bt) {
        String label;
        if (bt.count() < 10 || bt.mape() == null) {
            label = "Мало истории для проверки точности";
        } else if (bt.mape() <= 15) {
            label = "Высокая точность";
        } else if (bt.mape() <= 30) {
            label = "Средняя точность";
        } else {
            label = "Низкая точность — продажи сильно скачут от месяца к месяцу";
        }
        return new Accuracy(bt.mape(), bt.naiveMape(), bt.bias(), bt.coveragePct(), bt.count(), label);
    }
}
