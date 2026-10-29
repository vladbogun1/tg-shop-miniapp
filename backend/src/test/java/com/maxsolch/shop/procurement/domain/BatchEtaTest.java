package com.maxsolch.shop.procurement.domain;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/** The ETA rules of a batch: «~N weeks» and which of two batches comes sooner. */
class BatchEtaTest {

    private static PreorderBatch batch(long id, LocalDate from, PreorderBatch.EtaMode mode) {
        PreorderBatch b = new PreorderBatch();
        b.setId(id);
        b.setEtaFrom(from);
        b.setEtaMode(mode.name());
        return b;
    }

    @Test
    void approxWeeksRoundsUpAndBecomesZeroOnTheDay() {
        LocalDate today = LocalDate.of(2026, 10, 27);
        assertThat(BatchEta.approxWeeks(today.plusDays(1), today)).isEqualTo(1);
        assertThat(BatchEta.approxWeeks(today.plusDays(7), today)).isEqualTo(1);
        assertThat(BatchEta.approxWeeks(today.plusDays(8), today)).isEqualTo(2);
        assertThat(BatchEta.approxWeeks(today, today)).isZero();
        assertThat(BatchEta.approxWeeks(today.minusDays(3), today)).isZero();
        assertThat(BatchEta.approxWeeks(null, today)).isZero();
    }

    @Test
    void theEarlierKnownDateComesFirst() {
        PreorderBatch early = batch(2, LocalDate.of(2026, 11, 1), PreorderBatch.EtaMode.DATE);
        PreorderBatch late = batch(1, LocalDate.of(2026, 12, 1), PreorderBatch.EtaMode.DATE);

        assertThat(BatchEta.sooner(late, early)).isSameAs(early);
        assertThat(BatchEta.sooner(early, late)).isSameAs(early);
    }

    @Test
    void aKnownDateBeatsAHiddenOne() {
        PreorderBatch hidden = batch(1, LocalDate.of(2026, 11, 1), PreorderBatch.EtaMode.HIDDEN);
        PreorderBatch known = batch(2, LocalDate.of(2026, 12, 1), PreorderBatch.EtaMode.DATE);

        assertThat(BatchEta.sooner(hidden, known)).isSameAs(known);
    }

    @Test
    void sameDateGoesToTheOlderBatch() {
        PreorderBatch older = batch(1, LocalDate.of(2026, 11, 1), PreorderBatch.EtaMode.DATE);
        PreorderBatch newer = batch(2, LocalDate.of(2026, 11, 1), PreorderBatch.EtaMode.DATE);

        assertThat(BatchEta.bySoonest(newer, older)).isPositive();
        assertThat(BatchEta.sooner(newer, older)).isSameAs(older);
    }
}
