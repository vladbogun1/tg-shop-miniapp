package com.maxsolch.shop.finance.app;

import com.maxsolch.shop.procurement.app.CostingDtos.MarginRowDto;
import com.maxsolch.shop.procurement.app.CostingService;

import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Sums by a key; a line with unknown cost goes to {@code unknownRevenue}, not into the margin. */
final class MarginAgg {
    private final Map<String, long[]> sums = new LinkedHashMap<>();
    private final Map<String, String> labels = new HashMap<>();

    void add(String key, String label, int units, long revenue, long cost, boolean known) {
        long[] s = sums.computeIfAbsent(key, k -> new long[4]);
        labels.putIfAbsent(key, label);
        s[0] += units;
        if (known) {
            s[1] += revenue;
            s[2] += cost;
        } else {
            s[3] += revenue;
        }
    }

    List<MarginRowDto> rows(int limit) {
        return sums.entrySet().stream()
                .map(e -> {
                    long[] s = e.getValue();
                    long profit = s[1] - s[2];
                    return new MarginRowDto(e.getKey(), labels.get(e.getKey()), (int) s[0], s[1], s[2], profit,
                            s[1] > 0 ? CostingService.pct(profit, s[1]) : null, s[3]);
                })
                .sorted(Comparator.comparingLong((MarginRowDto r) -> r.revenueMinor() + r.unknownRevenueMinor())
                        .reversed())
                .limit(limit)
                .toList();
    }
}
