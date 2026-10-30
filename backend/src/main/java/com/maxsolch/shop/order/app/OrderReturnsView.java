package com.maxsolch.shop.order.app;

import org.springframework.lang.Nullable;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * What the order page shows about returns and exchanges. The order module declares it and the {@code returns}
 * module implements it, so the dependency points one way (returns → order) and the order never imports returns.
 */
public interface OrderReturnsView {

    /** Exchanges made on this order (V51), oldest first. */
    List<ExchangeDto> exchangesOf(byte[] orderId);

    /**
     * The order's return records, with what each did and whether it can be undone.
     *
     * @param thumbnails first photo per product id for the order's lines (asked only when there are records)
     */
    List<ReturnRecordDto> records(Order order, Function<List<OrderItem>, Map<String, String>> thumbnails);

    /** One return / exchange; only the newest active one can be cancelled ({@code cancellable}). */
    record ReturnRecordDto(long id,
                           /** RETURN | EXCHANGE */
                           String kind,
                           Instant createdAt,
                           @Nullable String adminName,
                           @Nullable String note,
                           List<ReturnRecordLineDto> lines,
                           long refundMinor,
                           @Nullable String refundChannel,
                           long monoRefundMinor,
                           /** Replacement order of an exchange. */
                           @Nullable String newOrderId,
                           @Nullable Instant cancelledAt,
                           @Nullable String cancelledBy,
                           @Nullable String cancelNote,
                           long debtMinor,
                           @Nullable Instant debtPaidAt,
                           boolean cancellable,
                           /** Why the newest record cannot be cancelled now (shown on the button). */
                           @Nullable String cancelBlocker) {
    }

    record ReturnRecordLineDto(long itemId,
                               String title,
                               @Nullable String imageUrl,
                               int quantity,
                               /** RESTOCK | DEFECT | KEPT | IN_TRANSIT */
                               String outcome,
                               int restockedQty,
                               int defectQty,
                               int pendingQty) {
    }

    record ExchangeDto(Instant createdAt,
                       String previousStatus,
                       @Nullable String previousTracking,
                       String returnedSummary,
                       String givenSummary,
                       long totalBeforeMinor,
                       long totalAfterMinor,
                       @Nullable String note,
                       @Nullable String adminName,
                       /** The replacement order (V69); null for exchanges made before it. */
                       @Nullable String newOrderId) {
    }
}
