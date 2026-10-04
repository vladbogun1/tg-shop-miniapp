package com.maxsolch.shop.analytics.metrics;

import com.maxsolch.shop.analytics.metrics.MetricsDtos.Forecast;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.OrderFact;
import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static com.maxsolch.shop.analytics.metrics.Fx.KYIV;
import static com.maxsolch.shop.analytics.metrics.Fx.facts;
import static com.maxsolch.shop.analytics.metrics.Fx.order;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class ForecastModelTest {

    private final LocalDate monday = LocalDate.parse("2026-06-01"); // a Monday

    @Test
    void flatHistory_forecastsTheSameLevel_andBacktestIsExact() {
        double[] y = new double[150];
        Arrays.fill(y, 1000);

        ForecastModel.Fit fit = ForecastModel.fit(y, monday);
        ForecastModel.Backtest bt = ForecastModel.backtest(y, monday);

        assertThat(fit.level()).isCloseTo(1000, within(1e-6));
        assertThat(ForecastModel.total(fit, monday.plusDays(150), 30)).isCloseTo(30_000, within(1e-6));
        assertThat(bt.mape()).isEqualTo(0.0);
        assertThat(bt.count()).isEqualTo(150 - ForecastModel.MIN_HISTORY - ForecastModel.HORIZON + 1);
    }

    @Test
    void weekdayPattern_isLearnedButDamped() {
        double[] y = new double[140];
        for (int i = 0; i < y.length; i++) {
            y[i] = monday.plusDays(i).getDayOfWeek() == DayOfWeek.SATURDAY ? 2000 : 1000;
        }
        ForecastModel.Fit fit = ForecastModel.fit(y, monday);

        double sat = fit.weekday()[5];
        double mon = fit.weekday()[0];
        // raw Saturday factor would be 2000/1142.9 = 1.75; pulled halfway back to 1 then renormalised
        assertThat(sat).isGreaterThan(1.2).isLessThan(1.75);
        assertThat(mon).isLessThan(1.0);
        assertThat(Arrays.stream(fit.weekday()).average().orElse(0)).isCloseTo(1.0, within(1e-9));
    }

    @Test
    void oneHugeDay_doesNotLiftTheWholeLevel() {
        double[] y = new double[100];
        Arrays.fill(y, 1000);
        y[99] = 50_000; // a wholesale-size order yesterday

        ForecastModel.Fit fit = ForecastModel.fit(y, monday);

        assertThat(fit.level()).isLessThan(1100); // capped at the 90th percentile of the window
    }

    @Test
    void band_widensForShortHorizons() {
        ForecastModel.Backtest bt = new ForecastModel.Backtest(List.of(), 20.0, 25.0, 0.0, 80.0, 0.8, 1.25);
        double[] b30 = ForecastModel.band(1000, bt, 30);
        double[] b7 = ForecastModel.band(1000, bt, 7);

        assertThat(b30[0]).isCloseTo(800, within(1e-6));
        assertThat(b30[1]).isCloseTo(1250, within(1e-6));
        assertThat(b7[1] - b7[0]).isGreaterThan(b30[1] - b30[0]);
    }

    @Test
    void monthForecast_isActualSoFarPlusTheRest() {
        Instant now = LocalDateTime.parse("2026-10-10T12:00:00").atZone(KYIV).toInstant();
        List<OrderFact> orders = new ArrayList<>();
        LocalDate start = LocalDate.parse("2026-05-01");
        for (LocalDate d = start; d.isBefore(LocalDate.parse("2026-10-10")); d = d.plusDays(1)) {
            orders.add(order(d.atTime(12, 0).atZone(KYIV).toInstant()).total(1000_00).build());
        }

        Forecast f = new ForecastCalculator(KYIV).compute(facts(now, orders, List.of(), List.of()), ChannelFilter.ALL);

        // 9 full days of October so far (1000 each); today nothing yet -> today + 21 days remain
        assertThat(f.month().actualToDateMinor()).isEqualTo(9_000_00);
        assertThat(f.month().daysLeft()).isEqualTo(22);
        assertThat(f.month().totalMinor()).isEqualTo(31_000_00);
        assertThat(f.next30().totalMinor()).isEqualTo(30_000_00);
        assertThat(f.accuracy().mape30()).isEqualTo(0.0);
        assertThat(f.history()).hasSize(ForecastCalculator.HISTORY_WEEKS);
        assertThat(f.forecast()).hasSize(ForecastCalculator.FORECAST_WEEKS);
    }
}
