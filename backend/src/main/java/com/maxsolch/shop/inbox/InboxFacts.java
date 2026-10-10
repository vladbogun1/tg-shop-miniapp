package com.maxsolch.shop.inbox;

import com.maxsolch.shop.analytics.metrics.MetricsDtos.ReorderRow;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.site.SiteRevalidator;

import java.time.Instant;
import java.util.List;

/**
 * Everything the inbox is computed from, loaded in a handful of grouped queries (see
 * {@link InboxStore}) and handed to the pure {@link InboxRules}.
 *
 * @param orders     candidate orders (pre-narrowed in SQL; the rules re-check every condition)
 * @param chats      orders with unread customer messages, one row per order
 * @param runningOut the «Заканчиваются» rows of the metrics
 * @param site       last outcome of the public-site rebuild; null = unknown
 */
public record InboxFacts(Instant now, List<OrderRow> orders, List<ChatRow> chats, List<ReorderRow> runningOut,
                         SiteRevalidator.Status site) {

    /** The order columns the inbox needs. */
    public record OrderRow(String id, OrderStatus status, String customerName, long totalMinor, long receivedMinor,
                           long prepaymentMinor, long refundedMinor, Instant createdAt, Instant approvedAt,
                           Instant shippedAt, Instant rejectedAt, Instant returnedAt, boolean paid,
                           Instant paidAt, boolean paidOnline, String rejectReason, String rejectReasonCode,
                           String cancelRequestStatus, String cancelRequestReason, Instant cancelRequestedAt,
                           Instant paymentDueAt) {

        /** Without the online payment deadline (older callers / tests): not an online-payment order. */
        public OrderRow(String id, OrderStatus status, String customerName, long totalMinor, long receivedMinor,
                        long prepaymentMinor, long refundedMinor, Instant createdAt, Instant approvedAt,
                        Instant shippedAt, Instant rejectedAt, Instant returnedAt, boolean paid,
                        Instant paidAt, boolean paidOnline, String rejectReason, String rejectReasonCode,
                        String cancelRequestStatus, String cancelRequestReason, Instant cancelRequestedAt) {
            this(id, status, customerName, totalMinor, receivedMinor, prepaymentMinor, refundedMinor, createdAt,
                    approvedAt, shippedAt, rejectedAt, returnedAt, paid, paidAt, paidOnline, rejectReason,
                    rejectReasonCode, cancelRequestStatus, cancelRequestReason, cancelRequestedAt, null);
        }

        /** Without a cancellation request (older callers / tests). */
        public OrderRow(String id, OrderStatus status, String customerName, long totalMinor, long receivedMinor,
                        long prepaymentMinor, long refundedMinor, Instant createdAt, Instant approvedAt,
                        Instant shippedAt, Instant rejectedAt, Instant returnedAt, boolean paid,
                        Instant paidAt, boolean paidOnline, String rejectReason, String rejectReasonCode) {
            this(id, status, customerName, totalMinor, receivedMinor, prepaymentMinor, refundedMinor, createdAt,
                    approvedAt, shippedAt, rejectedAt, returnedAt, paid, paidAt, paidOnline, rejectReason,
                    rejectReasonCode, null, null, null, null);
        }
    }

    /**
     * Unread customer messages of one order.
     *
     * @param lastMessageId id of the newest unread message — the event version: a new message
     *                      resurfaces a snoozed chat
     * @param firstUnreadAt the oldest unread message — how long the customer has been waiting
     * @param preview       short text of the newest unread message
     */
    public record ChatRow(String orderId, long unread, long lastMessageId, Instant firstUnreadAt, String preview) {
    }
}
