package com.maxsolch.shop.finance.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.maxsolch.shop.finance.domain.MarginRows.OrderRow;
import org.junit.jupiter.api.Test;

/**
 * The revenue of an order in the margin report was its own formula in {@code MarginService}; it now comes from
 * {@code OrderMoney}. The old formula is written here word for word and compared on a grid, so the swap
 * changed no kopeck (negative refunds and "not collected" included).
 */
class MarginRevenueGridTest {

    private static final long[] TOTALS = {0, 1, 99, 1000, 8999, 100_000};
    private static final long[] OTHER = {-500, -1, 0, 1, 50, 999, 1000, 1001, 8999, 9000, 150_000};

    @Test
    void revenueMatchesTheOldFormulaOnTheGrid() {
        for (long t : TOTALS) {
            for (long refunded : OTHER) {
                for (long uncollected : OTHER) {
                    long legacy = Math.max(0, t - Math.max(0, refunded) - Math.max(0, uncollected));
                    OrderRow o = new OrderRow("o", t, refunded, uncollected, "DELIVERED");
                    assertEquals(legacy, o.revenue(), t + "/" + refunded + "/" + uncollected);
                }
            }
        }
    }
}
