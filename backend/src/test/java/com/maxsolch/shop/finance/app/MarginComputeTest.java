package com.maxsolch.shop.finance.app;

import com.maxsolch.shop.procurement.app.CostingService.UnitCost;
import com.maxsolch.shop.finance.app.MarginService.Alloc;
import com.maxsolch.shop.finance.app.MarginService.Bundle;
import com.maxsolch.shop.finance.app.MarginService.Invoice;
import com.maxsolch.shop.finance.app.MarginService.ItemRow;
import com.maxsolch.shop.finance.app.MarginService.OrderMoney;
import com.maxsolch.shop.finance.app.MarginService.OrderRow;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Profit of an order: revenue − FIFO cost of goods − the fee of the bank. */
class MarginComputeTest {

    // lot 1: old pads at 500, lot 2: new ones at 300 (preliminary), lot 3: old stock with unknown cost
    static final Map<Long, UnitCost> COST = new HashMap<>(Map.of(
            1L, new UnitCost(50000L, false),
            2L, new UnitCost(30000L, true),
            3L, new UnitCost(null, false)));

    static OrderMoney money(OrderRow o, List<ItemRow> items, Map<Long, List<Alloc>> allocs, List<Invoice> inv) {
        return MarginService.compute(new Bundle(o, items, allocs, inv), COST::get);
    }

    @Test
    void twoLotsDiscountAndTheRealFee() {
        // 3 pads at 999, a 297 discount: total 2 700; two units from the old lot, one from the new one
        OrderRow o = new OrderRow("o", 270000, 0, 0, "APPROVED");
        ItemRow pads = new ItemRow(1, "o", "p", null, "Pad", null, 99900, 3, 0, 0, false);
        OrderMoney m = money(o, List.of(pads),
                Map.of(1L, List.of(new Alloc(1, 1, 2, null), new Alloc(1, 2, 1, null))),
                List.of(new Invoice("o", 270000, 3510)));

        assertThat(m.revenue()).isEqualTo(270000);
        assertThat(m.cost()).isEqualTo(2 * 50000 + 30000);
        assertThat(m.fee()).isEqualTo(3510);
        assertThat(m.feeEstimated()).isFalse();
        assertThat(m.profit()).isEqualTo(270000 - 130000 - 3510);
        assertThat(m.complete()).isTrue();
        assertThat(m.preliminary()).isTrue();
    }

    @Test
    void aGiftCostsTheShopAndAMissingFeeIsOnePointThreePercent() {
        OrderRow o = new OrderRow("o", 400000, 0, 0, "NEW");
        ItemRow mouse = new ItemRow(1, "o", "m", null, "Mouse", null, 400000, 1, 0, 0, false);
        ItemRow gift = new ItemRow(2, "o", "p", null, "Pad", null, 0, 1, 0, 0, true);
        OrderMoney m = money(o, List.of(mouse, gift),
                Map.of(1L, List.of(new Alloc(1, 2, 1, null)), 2L, List.of(new Alloc(2, 1, 1, null))),
                List.of(new Invoice("o", 400000, 0)));

        assertThat(m.lines().get(0).revenue()).isEqualTo(400000);
        assertThat(m.lines().get(1).revenue()).isZero();
        assertThat(m.lines().get(1).cost()).isEqualTo(50000);
        assertThat(m.fee()).isEqualTo(5200);
        assertThat(m.feeEstimated()).isTrue();
    }

    @Test
    void anUnpaidOnlineOrderExpectsTheFeeOnWhatIsDueOnline() {
        ItemRow pad = new ItemRow(1, "o", "p", null, "Pad", null, 400000, 1, 0, 0, false);
        Map<Long, List<Alloc>> allocs = Map.of(1L, List.of(new Alloc(1, 1, 1, null)));

        OrderMoney full = money(new OrderRow("o", 400000, 0, 0, "NEW", true, 0), List.of(pad), allocs, List.of());
        assertThat(full.fee()).isEqualTo(5200);
        assertThat(full.feeEstimated()).isTrue();

        OrderMoney prepay = money(new OrderRow("o", 400000, 0, 0, "NEW", true, 10000), List.of(pad), allocs,
                List.of());
        assertThat(prepay.fee()).isEqualTo(130);

        OrderMoney cash = money(new OrderRow("o", 400000, 0, 0, "NEW"), List.of(pad), allocs, List.of());
        assertThat(cash.fee()).isZero();
    }

    @Test
    void oldStockWithoutCostMakesTheOrderIncomplete() {
        OrderRow o = new OrderRow("o", 99900, 0, 0, "NEW");
        ItemRow pad = new ItemRow(1, "o", "p", null, "Pad", null, 99900, 2, 0, 0, false);
        OrderMoney m = money(o, List.of(pad), Map.of(1L, List.of(new Alloc(1, 3, 1, null))), List.of());

        // one unit from a lot with unknown cost, one not on any lot at all
        assertThat(m.lines().get(0).unknownUnits()).isEqualTo(2);
        assertThat(m.complete()).isFalse();
    }

    @Test
    void aWrittenOffReturnKeepsItsCostButNotItsRevenue() {
        // 2 sold, 1 came back damaged (returned, not restocked), refund 999
        OrderRow o = new OrderRow("o", 199800, 99900, 0, "DELIVERED");
        ItemRow pad = new ItemRow(1, "o", "p", null, "Pad", null, 99900, 2, 1, 0, false);
        OrderMoney m = money(o, List.of(pad), Map.of(1L, List.of(new Alloc(1, 1, 2, null))), List.of());

        assertThat(m.revenue()).isEqualTo(99900);
        assertThat(m.cost()).isEqualTo(100000);
        assertThat(m.profit()).isEqualTo(-100);
    }
}
