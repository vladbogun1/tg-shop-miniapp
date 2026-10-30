package com.maxsolch.shop.procurement.domain;

import com.maxsolch.shop.platform.util.Money;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Cost per unit of a batch's lines (docs/PREORDERS-PLAN.md §5А.1), computed, never stored: purchase price ×
 * the batch rate plus the line's share of the expenses. Shares are split by largest remainder, so they add
 * up to the expenses to the kopeck. A line without a price, or a foreign currency without a rate, has an
 * unknown cost (null) rather than a wrong one.
 */
public final class BatchCost {

    public enum Allocation { BY_VALUE, BY_QTY, BY_WEIGHT, MANUAL }

    /** One batch line as the computation needs it; {@code qty} = arrived, or ordered before the arrival. */
    public record Line(long id, int qty, Long unitPriceFx, Integer weightG, Long manualExtraMinor) {
    }

    /** One expense: {@code lineId} null = the whole batch. */
    public record Expense(Long lineId, long amountMinor, String currency, BigDecimal fxRate) {
    }

    /**
     * @param purchaseUnitMinor UAH kopecks per unit at the batch rate (null = unknown)
     * @param extraLineMinor    the line's share of the expenses, whole line
     * @param extraUnitMinor    the same per unit
     * @param costUnitMinor     purchase + expenses per unit (null = unknown)
     */
    public record LineCost(long id, int qty, Long purchaseUnitMinor, Long purchaseLineMinor, long extraLineMinor,
                           long extraUnitMinor, Long costUnitMinor) {
    }

    /**
     * @param expensesMinor  all expenses in UAH (the ones with a known rate)
     * @param unassignedMinor expenses no line took (MANUAL shares that do not add up, or nothing arrived)
     * @param problems       why the result is incomplete, for the admin («нет курса», «нет цены у …»)
     */
    public record Result(List<LineCost> lines, long purchaseMinor, long expensesMinor, long unassignedMinor,
                         List<String> problems) {

        public Map<Long, LineCost> byLine() {
            Map<Long, LineCost> m = new HashMap<>();
            lines.forEach(l -> m.put(l.id(), l));
            return m;
        }
    }

    private BatchCost() {
    }

    public static Result compute(String currency, BigDecimal fxRate, Allocation allocation, List<Line> lines,
                                 List<Expense> expenses) {
        List<String> problems = new ArrayList<>();
        BigDecimal rate = rateOf(currency, fxRate);
        if (rate == null) {
            problems.add("нет курса " + currency);
        }
        Map<Long, Long> purchaseUnit = new HashMap<>();
        Map<Long, Long> purchaseLine = new HashMap<>();
        long purchaseTotal = 0;
        for (Line l : lines) {
            if (l.unitPriceFx() == null) {
                problems.add("нет закупочной цены у позиции " + l.id());
                continue;
            }
            if (rate == null) {
                continue;
            }
            purchaseUnit.put(l.id(), toUah(l.unitPriceFx(), rate));
            long line = toUah(l.unitPriceFx() * (long) l.qty(), rate);
            purchaseLine.put(l.id(), line);
            purchaseTotal += line;
        }

        // Expenses in UAH: per line, and the pool shared by the whole batch.
        Map<Long, Long> direct = new HashMap<>();
        long pool = 0;
        long expensesTotal = 0;
        for (Expense e : expenses) {
            BigDecimal r = rateOf(e.currency(), e.fxRate());
            if (r == null) {
                problems.add("нет курса у расхода в " + e.currency());
                continue;
            }
            long uah = toUah(e.amountMinor(), r);
            expensesTotal += uah;
            if (e.lineId() != null && lines.stream().anyMatch(l -> l.id() == e.lineId())) {
                direct.merge(e.lineId(), uah, Long::sum);
            } else {
                pool += uah;
            }
        }

        Map<Long, Long> share = new HashMap<>();
        long unassigned = 0;
        if (allocation == Allocation.MANUAL) {
            long typed = 0;
            for (Line l : lines) {
                long m = l.manualExtraMinor() == null ? 0 : l.manualExtraMinor();
                share.put(l.id(), m);
                typed += m;
            }
            unassigned = pool - typed;
            if (unassigned != 0) {
                problems.add("вручную распределено не всё: разница " + unassigned / 100 + " ₴");
            }
        } else {
            Map<Long, Long> weights = new HashMap<>();
            for (Line l : lines) {
                long w = switch (allocation) {
                    case BY_VALUE -> purchaseLine.getOrDefault(l.id(), 0L);
                    case BY_QTY -> l.qty();
                    case BY_WEIGHT -> l.weightG() == null ? 0 : (long) l.weightG() * l.qty();
                    case MANUAL -> 0;
                };
                if (allocation == Allocation.BY_WEIGHT && l.weightG() == null && l.qty() > 0) {
                    problems.add("нет веса у позиции " + l.id());
                }
                weights.put(l.id(), Math.max(0, w));
            }
            if (weights.values().stream().mapToLong(Long::longValue).sum() == 0) {
                // nothing to weigh by (no prices yet, nothing arrived): fall back to units
                lines.forEach(l -> weights.put(l.id(), (long) Math.max(0, l.qty())));
            }
            Map<Long, Long> split = split(pool, weights);
            share.putAll(split);
            if (split.isEmpty()) {
                unassigned = pool;
            }
        }

        List<LineCost> out = new ArrayList<>();
        for (Line l : lines) {
            long extra = share.getOrDefault(l.id(), 0L) + direct.getOrDefault(l.id(), 0L);
            long extraUnit = l.qty() > 0 ? Money.quotient(extra, l.qty()) : 0;
            Long pu = purchaseUnit.get(l.id());
            out.add(new LineCost(l.id(), l.qty(), pu, purchaseLine.get(l.id()), extra, extraUnit,
                    pu == null ? null : pu + extraUnit));
        }
        return new Result(out, purchaseTotal, expensesTotal, unassigned, problems);
    }

    /** UAH per unit of the currency; UAH itself is 1. */
    public static BigDecimal rateOf(String currency, BigDecimal fxRate) {
        if (currency == null || "UAH".equalsIgnoreCase(currency)) {
            return BigDecimal.ONE;
        }
        return fxRate == null || fxRate.signum() <= 0 ? null : fxRate;
    }

    /** Minor units of a currency × rate = UAH kopecks. */
    public static long toUah(long minor, BigDecimal rate) {
        return Money.convert(minor, rate);
    }

    /** {@code total} split by {@code weights}, largest remainder: the parts add up to {@code total} exactly. */
    public static Map<Long, Long> split(long total, Map<Long, Long> weights) {
        long sum = weights.values().stream().mapToLong(Long::longValue).sum();
        Map<Long, Long> out = new HashMap<>();
        if (sum <= 0) {
            return out;
        }
        List<long[]> rest = new ArrayList<>();
        long given = 0;
        for (Map.Entry<Long, Long> w : weights.entrySet()) {
            BigDecimal exact = BigDecimal.valueOf(total).multiply(BigDecimal.valueOf(w.getValue()))
                    .divide(BigDecimal.valueOf(sum), 6, RoundingMode.HALF_UP);
            long floor = exact.setScale(0, RoundingMode.FLOOR).longValueExact();
            out.put(w.getKey(), floor);
            given += floor;
            long frac = exact.subtract(BigDecimal.valueOf(floor)).movePointRight(6).longValue();
            rest.add(new long[] {w.getKey(), frac, w.getValue()});
        }
        long left = total - given;
        rest.sort((a, b) -> a[1] != b[1] ? Long.compare(b[1], a[1]) : Long.compare(a[0], b[0]));
        for (int i = 0; left > 0 && !rest.isEmpty(); i = (i + 1) % rest.size()) {
            if (rest.get(i)[2] > 0) {
                out.merge(rest.get(i)[0], 1L, Long::sum);
                left--;
            } else if (rest.stream().noneMatch(r -> r[2] > 0)) {
                break;
            }
        }
        return out;
    }
}
