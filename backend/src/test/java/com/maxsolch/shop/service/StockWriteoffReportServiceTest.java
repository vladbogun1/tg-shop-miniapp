package com.maxsolch.shop.service;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.domain.StockWriteoff;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class StockWriteoffReportServiceTest {

    private static StockWriteoff row(int qty, long unit, String reason, boolean withOrder) {
        StockWriteoff w = new StockWriteoff();
        w.setId(1L);
        w.setProductId(UuidUtil.randomBytes());
        w.setTitle("Mouse X");
        w.setQuantity(qty);
        w.setUnitValueMinor(unit);
        w.setReason(reason);
        w.setCreatedAt(Instant.parse("2026-10-25T10:00:00Z"));
        if (withOrder) {
            w.setOrderId(UuidUtil.randomBytes());
        }
        return w;
    }

    @Test
    void totalsPerReasonAndValueIsQuantityTimesUnit() {
        StockWriteoffReportService.Report r = StockWriteoffReportService.build("month", List.of(
                row(2, 90_000, "DEFECT", true),
                row(1, 50_000, "DEFECT", false),
                row(3, 10_000, "INVENTORY", false)));

        assertThat(r.totalUnits()).isEqualTo(6);
        assertThat(r.totalValueMinor()).isEqualTo(2 * 90_000 + 50_000 + 3 * 10_000);
        assertThat(r.lines().get(0).valueMinor()).isEqualTo(180_000);
        assertThat(r.lines().get(0).orderShortId()).hasSize(8);
        assertThat(r.lines().get(1).orderShortId()).isNull();
        assertThat(r.byReason()).hasSize(StockWriteoff.Reason.values().length);
        assertThat(r.byReason().stream().filter(t -> t.reason().equals("DEFECT")).findFirst().orElseThrow())
                .satisfies(t -> {
                    assertThat(t.units()).isEqualTo(3);
                    assertThat(t.valueMinor()).isEqualTo(230_000);
                    assertThat(t.lines()).isEqualTo(2);
                });
    }

    @Test
    void anUnknownReasonLandsInOther() {
        StockWriteoffReportService.Report r = StockWriteoffReportService.build("all",
                List.of(row(1, 100, "WEIRD", false)));
        assertThat(r.byReason().stream().filter(t -> t.reason().equals("OTHER")).findFirst().orElseThrow().units())
                .isEqualTo(1);
    }

    @Test
    void weekIsSevenDays() {
        assertThat(TimeRange.parse("week")).isEqualTo(TimeRange.WEEK);
    }
}
