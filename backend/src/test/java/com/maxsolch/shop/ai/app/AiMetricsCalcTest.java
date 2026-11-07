package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.app.AiMetricsCalc.Waste;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.JobFact;
import com.maxsolch.shop.ai.domain.JobPath;
import com.maxsolch.shop.ai.domain.JobStatus;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** The numbers of the AI metrics: share, two «без правок» numbers, money in vain, days of the chart, the forecast. */
class AiMetricsCalcTest {

    private static final Instant T0 = Instant.parse("2026-11-05T10:00:00Z");
    private static final int RATE = 42_000;

    private static JobFact job(JobStatus status, long micro, String outcome, int applied, int rejected, int edited) {
        return new JobFact(1, AiFeature.CARD, JobPath.BUILTIN, status, null, micro, RATE, T0, outcome, applied,
                rejected, edited, outcome == null ? null : T0.plusSeconds(60), false);
    }

    private static JobFact failed(JobStatus status, String code, boolean retried) {
        return new JobFact(2, AiFeature.CARD, JobPath.BUILTIN, status, code, 10_000, RATE, T0, null, 0, 0, 0, null,
                retried);
    }

    private static JobFact manual(String reason) {
        return new JobFact(3, AiFeature.COMPLETION, JobPath.MANUAL, JobStatus.DONE, reason, 0, 0, T0, "APPLIED", 0, 0,
                0, T0, false);
    }

    @Test
    void moneyIsSummedBeforeItIsRoundedToKopecks() {
        // 3 jobs of 1000 micro-USD at 42 UAH: each alone is 4.2 kopecks (5 rounded, 15 together), the sum is 12.6: 13
        List<JobFact> three = List.of(job(JobStatus.DONE, 1_000, "APPLIED", 5, 0, 0),
                job(JobStatus.DONE, 1_000, "APPLIED", 5, 0, 0), job(JobStatus.DONE, 1_000, "APPLIED", 5, 0, 0));
        assertThat(AiMetricsCalc.spentMinor(three)).isEqualTo(13);
        // 0.20 UAH-ish: 47 619 micro-USD at 42 UAH = 2.000 UAH = 200 kopecks
        assertThat(AiMetricsCalc.spentMinor(List.of(job(JobStatus.DONE, 47_619, null, 0, 0, 0)))).isEqualTo(200);
    }

    @Test
    void shareIsBuiltInApplicationsAgainstManualMarksWithTheirReasons() {
        List<JobFact> facts = List.of(job(JobStatus.DONE, 1, "APPLIED", 5, 0, 0), job(JobStatus.DONE, 1, "PARTIAL", 3, 2, 0),
                job(JobStatus.DONE, 1, "REJECTED", 0, 5, 0), manual("LIMIT"), manual("CHOICE"), manual("CHOICE"));

        var share = AiMetricsCalc.share(facts);

        assertThat(share.builtin()).isEqualTo(2);
        assertThat(share.manual()).isEqualTo(3);
        assertThat(share.builtinPercent()).isEqualTo(40);
        assertThat(share.manualBy()).containsEntry("LIMIT", 1L).containsEntry("CHOICE", 2L).containsEntry("FAILURE", 0L);
    }

    @Test
    void aPastedAnswerCountsAsManualOnlyOnceSomebodyTookIt() {
        List<JobFact> facts = List.of(job(JobStatus.DONE, 1, "APPLIED", 5, 0, 0), pasted("OFF", null),
                pasted("OFF", "REJECTED"), pasted("OFF", "PARTIAL"), pasted("LIMIT", "APPLIED"));

        var share = AiMetricsCalc.share(facts);

        assertThat(share.manual()).isEqualTo(2);
        assertThat(share.manualBy()).containsEntry("OFF", 1L).containsEntry("LIMIT", 1L);
        assertThat(share.builtinPercent()).isEqualTo(33);
    }

    private static JobFact pasted(String reason, String outcome) {
        return new JobFact(4, AiFeature.CARD, JobPath.MANUAL, JobStatus.DONE, reason, 0, 0, T0, outcome, 1, 0, 0,
                outcome == null ? null : T0, false);
    }

    @Test
    void noManualAndNoBuiltInGivesNoShare() {
        assertThat(AiMetricsCalc.share(List.of()).builtinPercent()).isNull();
    }

    @Test
    void noEditsAreTwoNumbersAndNotOpenedIsApart() {
        List<JobFact> builtin = List.of(
                job(JobStatus.DONE, 1, "APPLIED", 10, 0, 0),   // whole, clean
                job(JobStatus.DONE, 1, "PARTIAL", 6, 4, 0),    // 6 of 10 fields, not whole
                job(JobStatus.DONE, 1, "APPLIED", 8, 0, 2),    // 6 clean of 8, not whole
                job(JobStatus.DONE, 1, null, 0, 0, 0),         // nobody opened it
                job(JobStatus.EMPTY, 1, null, 0, 0, 0));       // nothing to open

        var n = AiMetricsCalc.noEdits(builtin);

        // clean 10 + 6 + 6 = 22 of proposed 10 + 10 + 8 = 28
        assertThat(n.fieldsPercent()).isEqualTo(79);
        // 1 whole product of 3 decided
        assertThat(n.cardsPercent()).isEqualTo(33);
        assertThat(n.decided()).isEqualTo(3);
        assertThat(n.notOpened()).isEqualTo(1);
    }

    @Test
    void wasteLinesSeparateTheAiMissesFromWhatIsNotItsFault() {
        assertThat(AiMetricsCalc.waste(job(JobStatus.EMPTY, 1, null, 0, 0, 0))).isEqualTo(Waste.NODATA);
        assertThat(AiMetricsCalc.waste(failed(JobStatus.FAILED, "RESTARTED", false))).isEqualTo(Waste.LOST);
        assertThat(AiMetricsCalc.waste(failed(JobStatus.FAILED, "MODEL_FAILED", false))).isEqualTo(Waste.FAILED);
        assertThat(AiMetricsCalc.waste(failed(JobStatus.BAD_ANSWER, null, true))).isEqualTo(Waste.FAILED);
        assertThat(AiMetricsCalc.waste(new JobFact(4, AiFeature.CARD, JobPath.BUILTIN, JobStatus.DONE, null, 1, RATE, T0,
                "REJECTED", 0, 5, 0, T0, true))).isEqualTo(Waste.RETRIED);
        assertThat(AiMetricsCalc.waste(job(JobStatus.DONE, 1, "REJECTED", 0, 5, 0))).isEqualTo(Waste.REJECTED);
        assertThat(AiMetricsCalc.waste(job(JobStatus.CANCELED, 1, null, 0, 0, 0))).isEqualTo(Waste.CANCELED);
        assertThat(AiMetricsCalc.waste(job(JobStatus.DONE, 1, "APPLIED", 5, 0, 0))).isNull();
    }

    @Test
    void theTotalInVainDoesNotCountRejectedOrStopped() {
        List<JobFact> builtin = List.of(job(JobStatus.EMPTY, 47_619, null, 0, 0, 0), // 2.00 UAH, counted
                job(JobStatus.DONE, 47_619, "REJECTED", 0, 5, 0),                    // 2.00, shown, not counted
                job(JobStatus.CANCELED, 47_619, null, 0, 0, 0));                     // 2.00, shown, not counted

        assertThat(AiMetricsCalc.wastedMinor(builtin)).isEqualTo(200);
        var rows = AiMetricsCalc.wasteRows(builtin);
        assertThat(rows).extracting("key").containsExactly("NODATA", "REJECTED", "CANCELED");
        assertThat(rows).extracting("counted").containsExactly(true, false, false);
    }

    @Test
    void appliedBlindlyIsFastAndLarge() {
        JobFact fast = new JobFact(5, AiFeature.CARD, JobPath.BUILTIN, JobStatus.DONE, null, 1, RATE, T0, "APPLIED", 12, 0,
                0, T0.plusSeconds(3), false);
        JobFact slow = new JobFact(6, AiFeature.CARD, JobPath.BUILTIN, JobStatus.DONE, null, 1, RATE, T0, "APPLIED", 12, 0,
                0, T0.plusSeconds(30), false);
        JobFact small = new JobFact(7, AiFeature.CARD, JobPath.BUILTIN, JobStatus.DONE, null, 1, RATE, T0, "APPLIED", 4, 0,
                0, T0.plusSeconds(1), false);

        var f = AiMetricsCalc.fastApply(List.of(fast, slow, small));

        assertThat(f.count()).isEqualTo(1);
        assertThat(f.of()).isEqualTo(2);
    }

    @Test
    void theChartHasEveryDayOfTheRangeInShopTime() {
        ZoneId kyiv = ZoneId.of("Europe/Kyiv");
        // 23:30 UTC on the 4th is already the 5th in Kyiv (UTC+2 in November)
        JobFact late = new JobFact(8, AiFeature.CARD, JobPath.BUILTIN, JobStatus.DONE, null, 47_619, RATE,
                Instant.parse("2026-11-04T23:30:00Z"), "APPLIED", 5, 0, 0, null, false);

        var rows = AiMetricsCalc.byDay(List.of(late), LocalDate.parse("2026-11-04"), LocalDate.parse("2026-11-06"), kyiv);

        assertThat(rows).extracting("key").containsExactly("2026-11-04", "2026-11-05", "2026-11-06");
        assertThat(rows).extracting("costMinor").containsExactly(0L, 200L, 0L);
        assertThat(rows.get(1).accepted()).isEqualTo(1);
    }

    @Test
    void theForecastScalesTheSpendAndWaitsForThreeDays() {
        Duration month = Duration.ofDays(30);
        assertThat(AiMetrics.forecastMicro(1_000_000, Duration.ofDays(2), month)).isEqualTo(-1);
        assertThat(AiMetrics.forecastMicro(0, Duration.ofDays(10), month)).isEqualTo(-1);
        assertThat(AiMetrics.forecastMicro(1_000_000, Duration.ofDays(10), month)).isEqualTo(3_000_000);
        assertThat(AiMetrics.forecastMicro(1_000_000, Duration.ofDays(30), month)).isEqualTo(1_000_000);
    }
}
