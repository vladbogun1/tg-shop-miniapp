package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.procurement.app.PreorderBatchService;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Pre-order API shapes: customer (me/public) first, then admin. Ids of products/variants are UUID strings. */
public final class PreorderDtos {

    private PreorderDtos() {
    }

    // ---- customer / public ----

    /**
     * When goods are expected, as the customer sees it. {@code stage}: {@code ordered} | {@code in_transit};
     * {@code mode} DATE / RANGE / APPROX / HIDDEN; {@code approxWeeks} only for APPROX (0 = «найближчим часом»).
     */
    public record EtaDto(String stage, String mode, LocalDate from, LocalDate to, Integer approxWeeks, String note) {
    }

    public record SubscribeRequest(String productId, String variantId, Integer qty) {
    }

    /**
     * One of my places in a queue. {@code position} — for WAITING (1 = next); {@code holdUntil} — for HELD.
     * {@code eta} — the open batch that brings the line, if any.
     */
    public record MyPreorderDto(long id, String productId, String variantId, String productTitle, String productSlug,
                                String imageUrl, String variantName, int qty, String status, Integer position,
                                int heldQty, Instant holdUntil, Instant createdAt, EtaDto eta) {
    }

    /** A line (product or variant) that is on its way. */
    public record LineDto(String variantId, EtaDto eta) {
    }

    /**
     * Pre-order block of a product page. {@code lines} — variants (or the product, variantId null) in an open
     * batch; {@code waitingCount} null below the «show from» threshold; {@code anyProduct} — the customer
     * may queue for out-of-stock goods without a batch too. {@code holdHours} — how long a hold lasts once
     * the goods arrive (the soonest batch's value, else the shop default).
     */
    public record ProductPreorderDto(String productId, List<LineDto> lines, Integer waitingCount,
                                     boolean anyProduct, List<MyPreorderDto> mine, int holdHours) {
    }

    /** «Скоро в наявності»: open batches and what they bring; {@code holdHours} — the batch's hold. */
    public record ComingDto(EtaDto eta, List<ComingLineDto> lines, int holdHours) {
    }

    public record ComingLineDto(String productId, String variantId) {
    }

    // ---- admin ----

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

    public record SubscriberDto(long id, long userId, String name, String username, boolean botBlocked,
                                String productId, String variantId, String productTitle, String variantName,
                                int qty, String status, Integer position, int heldQty, Instant holdUntil,
                                String source, Instant createdAt, Instant closedAt, String closeReason) {
    }

    /**
     * «Чего ждут»: one line with its queue. {@code openBatchId} — a batch already brings it.
     * {@code productPeople} — distinct people waiting for ANY variant of the product (one person in two
     * variants counts once), so the UI can total per product without double counting.
     */
    public record DemandDto(String productId, String variantId, String title, String variantName, String imageUrl,
                            int stock, long priceMinor, long people, long units, Instant firstAt, long newLast7d,
                            Long openBatchId, String openBatchTitle, long productPeople) {
    }

    /**
     * Pre-order numbers for a period (Kyiv days, inclusive). Hold figures are in units; what is approximated
     * is explained at {@code PreorderBatchService#metrics}.
     */
    public record MetricsDto(int subscriptions, int people, int holdsGiven, int boughtFromHold, int expired,
                             double conversionPercent, int arrivedUnits) {
    }

    public record ReleaseRequest(String productId, String variantId) {
    }

    /** Manual hand-out after a restock outside a batch. */
    public record ReleaseResult(int heldPeople, int heldQty, int shortPeople, int freeAfter) {
    }
}
