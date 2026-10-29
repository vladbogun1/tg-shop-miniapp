package com.maxsolch.shop.procurement.domain;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Batch cost per unit: purchase × rate + a share of the expenses that adds up to the kopeck. */
class BatchCostTest {

    static final BigDecimal USD = new BigDecimal("41.35");

    // Maya X white 10 × $52, black 5 × $52, a mouse pad 7 × $9.99 (the example in §5А.1 of the plan)
    static List<BatchCost.Line> lines() {
        return List.of(
                new BatchCost.Line(1, 10, 5200L, 60, 0L),
                new BatchCost.Line(2, 5, 5200L, 60, 0L),
                new BatchCost.Line(3, 7, 999L, 350, 0L));
    }

    static List<BatchCost.Expense> expenses() {
        return List.of(
                new BatchCost.Expense(null, 9600, "USD", USD),     // freight $96
                new BatchCost.Expense(null, 712001, "UAH", null),  // customs 7 120,01 UAH
                new BatchCost.Expense(null, 150000, "UAH", null)); // broker
    }

    @ParameterizedTest
    @EnumSource(value = BatchCost.Allocation.class, names = {"BY_VALUE", "BY_QTY", "BY_WEIGHT"})
    void sharesAddUpToTheExpensesToTheKopeck(BatchCost.Allocation mode) {
        BatchCost.Result r = BatchCost.compute("USD", USD, mode, lines(), expenses());

        long expenses = 396960 + 712001 + 150000;
        assertThat(r.expensesMinor()).isEqualTo(expenses);
        assertThat(r.lines().stream().mapToLong(BatchCost.LineCost::extraLineMinor).sum()).isEqualTo(expenses);
        assertThat(r.unassignedMinor()).isZero();
        assertThat(r.problems()).isEmpty();
    }

    @Test
    void byValueTheExpensiveMouseCarriesMoreThanThePad() {
        Map<Long, BatchCost.LineCost> r = BatchCost.compute("USD", USD, BatchCost.Allocation.BY_VALUE, lines(),
                expenses()).byLine();

        assertThat(r.get(1L).purchaseUnitMinor()).isEqualTo(215020); // $52 × 41,35 = 2 150,20
        assertThat(r.get(1L).extraUnitMinor()).isGreaterThan(r.get(3L).extraUnitMinor() * 4);
        assertThat(r.get(1L).costUnitMinor()).isEqualTo(r.get(1L).purchaseUnitMinor() + r.get(1L).extraUnitMinor());
        assertThat(r.get(1L).extraUnitMinor()).isEqualTo(r.get(2L).extraUnitMinor());
    }

    @Test
    void manualTakesTheTypedSharesAndReportsTheGap() {
        List<BatchCost.Line> manual = List.of(
                new BatchCost.Line(1, 10, 5200L, null, 1_000_000L),
                new BatchCost.Line(2, 5, 5200L, null, 200_000L));
        BatchCost.Result r = BatchCost.compute("USD", USD, BatchCost.Allocation.MANUAL, manual, expenses());

        assertThat(r.byLine().get(1L).extraLineMinor()).isEqualTo(1_000_000L);
        assertThat(r.unassignedMinor()).isEqualTo(396960 + 712001 + 150000 - 1_200_000);
        assertThat(r.problems()).anyMatch(p -> p.contains("вручную"));
    }

    @Test
    void anExpenseOfOneLineStaysOnItAndACompensationLowersTheCost() {
        List<BatchCost.Expense> ex = List.of(
                new BatchCost.Expense(3L, 70000, "UAH", null),     // duty on the pads only
                new BatchCost.Expense(null, -10000, "UAH", null)); // compensation from the factory
        BatchCost.Result r = BatchCost.compute("UAH", null, BatchCost.Allocation.BY_QTY,
                List.of(new BatchCost.Line(1, 10, 100000L, null, null), new BatchCost.Line(3, 10, 30000L, null, null)),
                ex);

        assertThat(r.byLine().get(3L).extraLineMinor()).isEqualTo(70000 - 5000);
        assertThat(r.byLine().get(1L).extraLineMinor()).isEqualTo(-5000);
        assertThat(r.byLine().get(1L).costUnitMinor()).isEqualTo(100000 - 500);
    }

    @Test
    void noRateOrNoPriceMeansUnknownNotWrong() {
        BatchCost.Result r = BatchCost.compute("USD", null, BatchCost.Allocation.BY_VALUE,
                List.of(new BatchCost.Line(1, 3, 5200L, null, null), new BatchCost.Line(2, 3, null, null, null)),
                List.of());

        assertThat(r.byLine().get(1L).costUnitMinor()).isNull();
        assertThat(r.byLine().get(2L).costUnitMinor()).isNull();
        assertThat(r.problems()).anyMatch(p -> p.contains("нет курса")).anyMatch(p -> p.contains("нет закупочной"));
    }

    @Test
    void splitIsExactForAwkwardNumbers() {
        Map<Long, Long> parts = BatchCost.split(100, Map.of(1L, 1L, 2L, 1L, 3L, 1L));
        assertThat(parts.values().stream().mapToLong(Long::longValue).sum()).isEqualTo(100);
        assertThat(parts.values()).containsOnly(33L, 34L);
    }
}
