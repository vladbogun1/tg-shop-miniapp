package com.maxsolch.shop.procurement.app;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.springframework.lang.Nullable;

/** Admin API of the money side («Финансы» only). All amounts are UAH kopecks unless named {@code *Fx}. */
public final class CostingDtos {

    private CostingDtos() {
    }

    // ----- batch money (§5А.1)

    public record MoneyLineDto(long itemId, String productId, @Nullable String variantId, String title, @Nullable String variantName,
                               @Nullable String imageUrl, int qtyOrdered, @Nullable Integer qtyArrived, int qty, @Nullable Long unitPriceFx,
                               @Nullable Integer weightG, @Nullable Long manualExtraMinor, @Nullable Long purchaseUnitMinor,
                               @Nullable Long purchaseLineMinor, long extraLineMinor, long extraUnitMinor,
                               @Nullable Long costUnitMinor, long priceMinor, @Nullable Long marginUnitMinor, @Nullable Double marginPct) {
    }

    public record ExpenseDto(long id, @Nullable Long itemId, @Schema(allowableValues = {"FREIGHT", "CUSTOMS", "BROKER", "DOMESTIC", "BANK", "OTHER"}) String kind, long amountMinor, String currency,
                             @Nullable BigDecimal fxRate, long amountUahMinor, @Nullable LocalDate spentOn, @Nullable String note,
                             @Nullable String createdBy, Instant createdAt, List<ExpenseFileDto> files) {
    }

    /** A document of an expense; the bytes come from {@code GET /api/admin/costing/expense-files/{id}}. */
    public record ExpenseFileDto(long id, String name, @Nullable String contentType, long sizeBytes, Instant createdAt) {
    }

    /**
     * @param preliminary not every expense is in yet («Все расходы внесены» not pressed) or something is missing
     */
    public record BatchMoneyDto(long batchId, String title, String status, String currency, @Nullable BigDecimal fxRate,
                                @Schema(allowableValues = {"BY_VALUE", "BY_QTY", "BY_WEIGHT", "MANUAL"}) String allocation, boolean costsFinal, boolean preliminary,
                                List<MoneyLineDto> lines, List<ExpenseDto> expenses, long purchaseMinor,
                                long expensesMinor, @Nullable Double expensesPct, long unassignedMinor, long totalMinor,
                                List<String> problems) {
    }

    public record MoneyLineRequest(long itemId, Long unitPriceFx, Integer weightG, Long manualExtraMinor) {
    }

    public record MoneyRequest(String currency, BigDecimal fxRate, String allocation, Boolean costsFinal,
                               List<MoneyLineRequest> lines) {
    }

    public record ExpenseRequest(Long itemId, String kind, Long amountMinor, String currency, BigDecimal fxRate,
                                 LocalDate spentOn, String note) {
    }

    public record RateDto(String currency, LocalDate date, BigDecimal rate) {
    }

    // ----- P&L of a batch (§5А.3)

    /** {@code sold} — in paid (sold) orders only; {@code reserved} — in orders still awaiting online payment. */
    public record BatchSalesLineDto(long itemId, String title, @Nullable String variantName, int arrived, int sold,
                                    int reserved, int left, @Nullable Long costUnitMinor, long revenueMinor, long costMinor,
                                    long profitMinor) {
    }

    public record BatchSalesDto(long batchId, long spentMinor, long revenueMinor, long costOfSoldMinor,
                                long profitMinor, @Nullable Double marginPct, int arrived, int sold, int reserved, int left,
                                long leftValueMinor, @Nullable Instant arrivedAt, @Nullable Instant soldOutAt, @Nullable Integer daysToSellOut,
                                boolean preliminary, List<BatchSalesLineDto> lines) {
    }

    // ----- product (§5А.3)

    public record LotDto(long id, @Nullable String variantId, @Nullable String variantName, @Schema(allowableValues = {"OPENING", "BATCH", "MANUAL"}) String kind, @Nullable Long batchId,
                         @Nullable String batchTitle, int qtyIn, int qtyLeft, @Nullable Long unitCostMinor, boolean preliminary,
                         Instant createdAt) {
    }

    /** {@code current*} = the lot that sells next (the oldest with units left, FIFO). */
    public record ProductCostDto(String productId, long priceMinor, @Nullable Long currentCostMinor,
                                 @Nullable Boolean currentPreliminary, @Nullable Long marginMinor, @Nullable Double marginPct,
                                 @Nullable Double markupPct, int stock, int onLots, List<LotDto> lots) {
    }

    public record OpeningRowDto(String productId, @Nullable String variantId, String title, @Nullable String variantName,
                                @Nullable String imageUrl, int units, @Nullable Long unitCostMinor, long priceMinor) {
    }

    public record OpeningRequest(String productId, String variantId, Long unitCostMinor) {
    }

    public record ReconcileDto(int keys, int fixed, List<String> details) {
    }

    // ----- order (§5А.3)

    public record OrderLineCostDto(long itemId, String title, @Nullable String variantName, boolean gift, int units,
                                   long revenueMinor, long costMinor, int unknownUnits, boolean preliminary) {
    }

    /**
     * profit = revenue − cost of goods − acquiring fee; {@code complete} = every unit has a known cost.
     */
    public record OrderProfitDto(String orderId, long revenueMinor, long costMinor, long feeMinor,
                                 boolean feeEstimated, long profitMinor, @Nullable Double marginPct, boolean complete,
                                 boolean preliminary, List<OrderLineCostDto> lines) {
    }

    // ----- report «Метрики → Маржа» (§5А.3)

    public record MarginRowDto(String key, String label, int units, long revenueMinor, long costMinor,
                               long profitMinor, Double marginPct, long unknownRevenueMinor) {
    }

    /**
     * Sums are over the sales whose cost is known; {@code knownShare} = their part of the revenue.
     */
    public record MarginReportDto(Instant from, Instant to, long revenueMinor, long knownRevenueMinor,
                                  Double knownShare, long costMinor, long feeMinor, long giftsCostMinor,
                                  long profitMinor, Double marginPct, long stockValueMinor, int stockUnits,
                                  int stockUnknownUnits, List<MarginRowDto> byProduct, List<MarginRowDto> byBrand,
                                  List<MarginRowDto> byCategory, List<MarginRowDto> byBatch) {
    }
}
