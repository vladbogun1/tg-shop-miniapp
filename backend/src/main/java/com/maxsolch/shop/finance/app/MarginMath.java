package com.maxsolch.shop.finance.app;

import com.maxsolch.shop.finance.domain.MarginRows.Alloc;
import com.maxsolch.shop.finance.domain.MarginRows.Bundle;
import com.maxsolch.shop.finance.domain.MarginRows.Invoice;
import com.maxsolch.shop.finance.domain.MarginRows.ItemRow;
import com.maxsolch.shop.finance.domain.MarginRows.LineMoney;
import com.maxsolch.shop.finance.domain.MarginRows.OrderProfit;
import com.maxsolch.shop.procurement.app.CostingService.UnitCost;
import com.maxsolch.shop.procurement.domain.BatchCost;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * Profit of one order: revenue is split over its lines by price, cost of goods comes from the lots each unit
 * left (priced by the caller), the acquiring fee is the bank's own or {@code feePercent} of the amount.
 */
final class MarginMath {

    /** monobank acquiring, as measured on prod 27.10.2026 (1,3 % for every method): the setting's default. */
    static final BigDecimal DEFAULT_FEE_PERCENT = new BigDecimal("1.3");

    private MarginMath() {
    }

    static OrderProfit compute(Bundle b, Function<Long, UnitCost> costOfLot) {
        return compute(b, costOfLot, DEFAULT_FEE_PERCENT);
    }

    /** {@code feePercent}: the bank's cut where monobank sent no fee of its own. */
    static OrderProfit compute(Bundle b, Function<Long, UnitCost> costOfLot, BigDecimal feePercent) {
        long revenue = b.order().revenue();
        long base = b.items().stream().filter(i -> !i.gift()).mapToLong(i -> i.priceMinor() * i.soldUnits()).sum();
        List<ItemRow> paid = b.items().stream().filter(i -> !i.gift() && i.priceMinor() * i.soldUnits() > 0).toList();
        Map<Long, Long> share = new HashMap<>();
        if (base > 0) {
            Map<Long, Long> w = new HashMap<>();
            paid.forEach(i -> w.put(i.id(), i.priceMinor() * i.soldUnits()));
            share.putAll(BatchCost.split(revenue, w));
        }
        List<LineMoney> lines = new ArrayList<>();
        long cost = 0;
        boolean complete = true;
        boolean preliminary = false;
        for (ItemRow i : b.items()) {
            List<Alloc> al = b.allocs().getOrDefault(i.id(), List.of());
            long c = 0;
            int unknown = 0;
            int allocated = 0;
            boolean pre = false;
            for (Alloc a : al) {
                UnitCost u = costOfLot.apply(a.lotId());
                allocated += a.qty();
                if (u.minor() == null) {
                    unknown += a.qty();
                } else {
                    c += u.minor() * a.qty();
                    pre |= u.preliminary();
                }
            }
            unknown += Math.max(0, i.unitsOut() - allocated);
            lines.add(new LineMoney(i, share.getOrDefault(i.id(), 0L), c, unknown, pre, al));
            cost += c;
            complete &= unknown == 0;
            preliminary |= pre;
        }
        long fee = 0;
        boolean estimated = false;
        for (Invoice inv : b.invoices()) {
            if (inv.feeMinor() > 0) {
                fee += inv.feeMinor();
            } else if (inv.amountMinor() > 0) {
                fee += fee(inv.amountMinor(), feePercent);
                estimated = true;
            }
        }
        if (b.invoices().isEmpty() && b.order().onlineDueMinor() > 0) {
            // not paid yet: the fee monobank will take once it is
            fee = fee(b.order().onlineDueMinor(), feePercent);
            estimated = true;
        }
        return new OrderProfit(b.order(), lines, revenue, cost, fee, estimated, complete, preliminary);
    }

    static long fee(long amountMinor, BigDecimal feePercent) {
        return BigDecimal.valueOf(amountMinor).multiply(feePercent).movePointLeft(2)
                .setScale(0, RoundingMode.HALF_UP).longValue();
    }
}
