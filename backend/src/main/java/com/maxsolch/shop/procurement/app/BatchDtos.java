package com.maxsolch.shop.procurement.app;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

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

    public record SupplierDto(long id, String name, String note) {
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

    public record BatchSummaryDto(long id, String title, String supplierName, String status, String etaMode,
                                  LocalDate etaFrom, LocalDate etaTo, boolean preorderOpen, int itemsCount,
                                  int qtyOrdered, long waitingPeople, long waitingQty, Instant createdAt,
                                  Instant arrivedAt) {
    }

    /** {@code unitPriceFx} — null unless the caller may see money (main admin). */
    public record ItemDto(long id, String productId, String variantId, String title, String variantName,
                          String imageUrl, int stock, long priceMinor, int qtyOrdered, Integer qtyArrived,
                          Long unitPriceFx, long waitingPeople, long waitingQty) {
    }

    /** {@code fxRate} and item prices are null unless {@code moneyVisible}. */
    public record BatchDto(long id, String title, Long supplierId, String supplierName, String privateNote,
                           String publicNote, String status, String etaMode, LocalDate etaFrom, LocalDate etaTo,
                           EtaDto eta, int holdHours, String distribution, boolean preorderOpen, String currency,
                           BigDecimal fxRate, boolean moneyVisible, List<ItemDto> items, String createdBy,
                           Instant createdAt, Instant inTransitAt, Instant arrivedAt, Instant cancelledAt) {
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
    public record ArriveLineResult(long itemId, String title, String variantName, int arrived, int stockAfter,
                                   int heldPeople, int heldQty, int notifiedPeople, int shortPeople, int freeAfter,
                                   long priceMinor) {
    }

    public record ArriveResult(boolean dryRun, String distribution, int holdHours, List<ArriveLineResult> lines) {
    }
}
