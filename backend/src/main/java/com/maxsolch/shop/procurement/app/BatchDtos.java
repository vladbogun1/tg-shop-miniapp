package com.maxsolch.shop.procurement.app;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.springframework.lang.Nullable;

/** Batch ("Поставки") API shapes: suppliers, batches with their lines, arrival. Ids of products/variants are UUID strings. */
public final class BatchDtos {

    private BatchDtos() {
    }

    /**
     * When goods are expected, as the customer sees it. {@code stage}: {@code ordered} | {@code in_transit};
     * {@code mode} DATE / RANGE / APPROX / HIDDEN; {@code approxWeeks} only for APPROX (0 = «найближчим часом»).
     */
    public record EtaDto(String stage, String mode, LocalDate from, LocalDate to, Integer approxWeeks, String note) {
    }

    public record SupplierDto(long id, String name, @Nullable String note) {
    }

    public record SupplierRequest(String name, String note) {
    }

    /** {@code id} null = a new line; a line left out of an update is removed (only before arrival). */
    public record ItemRequest(Long id, String productId, String variantId, Integer qtyOrdered, Long unitPriceFx) {
    }

    public record BatchRequest(String title, Long supplierId, String privateNote, String publicNote,
                               String etaMode, LocalDate etaFrom, LocalDate etaTo, Integer holdHours,
                               String distribution, Boolean preorderOpen, String currency, BigDecimal fxRate,
                               List<ItemRequest> items) {
    }

    public record BatchSummaryDto(long id, String title, @Nullable String supplierName, @Schema(allowableValues = {"ORDERED", "IN_TRANSIT", "CUSTOMS", "ARRIVED", "CANCELLED"}) String status, @Schema(allowableValues = {"DATE", "RANGE", "APPROX", "HIDDEN"}) String etaMode,
                                  @Nullable LocalDate etaFrom, @Nullable LocalDate etaTo, boolean preorderOpen, int itemsCount,
                                  int qtyOrdered, long waitingPeople, long waitingQty, Instant createdAt,
                                  @Nullable Instant arrivedAt) {
    }

    /** {@code unitPriceFx} — null unless the caller may see money (main admin). */
    public record ItemDto(long id, String productId, @Nullable String variantId, String title, @Nullable String variantName,
                          @Nullable String imageUrl, int stock, long priceMinor, int qtyOrdered, @Nullable Integer qtyArrived,
                          @Nullable Long unitPriceFx, long waitingPeople, long waitingQty) {
    }

    /** {@code fxRate} and item prices are null unless {@code moneyVisible}. */
    public record BatchDto(long id, String title, @Nullable Long supplierId, @Nullable String supplierName, @Nullable String privateNote,
                           @Nullable String publicNote, @Schema(allowableValues = {"ORDERED", "IN_TRANSIT", "CUSTOMS", "ARRIVED", "CANCELLED"}) String status, @Schema(allowableValues = {"DATE", "RANGE", "APPROX", "HIDDEN"}) String etaMode, @Nullable LocalDate etaFrom, @Nullable LocalDate etaTo,
                           EtaDto eta, int holdHours, @Schema(allowableValues = {"QUEUE_HOLD", "ALL_AT_ONCE"}) String distribution, boolean preorderOpen, @Nullable String currency,
                           @Nullable BigDecimal fxRate, boolean moneyVisible, List<ItemDto> items, @Nullable String createdBy,
                           Instant createdAt, @Nullable Instant inTransitAt, @Nullable Instant arrivedAt, @Nullable Instant cancelledAt) {
    }

    public record StatusRequest(String status) {
    }

    public record CancelRequest(Boolean closeQueue, String note) {
    }

    /** {@code priceMinor} — the new selling price, null = keep. */
    public record ArriveLine(long itemId, Integer qtyArrived, Long priceMinor) {
    }

    public record ArriveRequest(Boolean dryRun, String distribution, Integer holdHours, List<ArriveLine> items) {
    }

    /** One line of the «Приехала» preview / result. */
    public record ArriveLineResult(long itemId, String title, @Nullable String variantName, int arrived, int stockAfter,
                                   int heldPeople, int heldQty, int notifiedPeople, int shortPeople, int freeAfter,
                                   long priceMinor) {
    }

    public record ArriveResult(boolean dryRun, @Schema(allowableValues = {"QUEUE_HOLD", "ALL_AT_ONCE"}) String distribution, int holdHours, List<ArriveLineResult> lines) {
    }
}
