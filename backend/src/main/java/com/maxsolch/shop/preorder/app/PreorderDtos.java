package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.procurement.app.BatchDtos.EtaDto;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Pre-order API shapes: customer (me/public) first, then admin. Ids of products/variants are UUID strings. */
public final class PreorderDtos {

    private PreorderDtos() {
    }

    // ---- customer / public ----

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
     * is explained at {@code PreorderAdmin#metrics}.
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
