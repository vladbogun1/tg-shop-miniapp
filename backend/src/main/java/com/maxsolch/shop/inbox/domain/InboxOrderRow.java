package com.maxsolch.shop.inbox.domain;

import com.maxsolch.shop.order.domain.OrderStatus;

import java.time.Instant;

/** The order columns the inbox needs. */
public record InboxOrderRow(String id, OrderStatus status, String customerName, long totalMinor, long receivedMinor,
                       long prepaymentMinor, long refundedMinor, Instant createdAt, Instant approvedAt,
                       Instant shippedAt, Instant rejectedAt, Instant returnedAt, boolean paid,
                       Instant paidAt, boolean paidOnline, String rejectReason, String rejectReasonCode,
                       String cancelRequestStatus, String cancelRequestReason, Instant cancelRequestedAt,
                       Instant paymentDueAt) {

    /** Without the online payment deadline (older callers / tests): not an online-payment order. */
    public InboxOrderRow(String id, OrderStatus status, String customerName, long totalMinor, long receivedMinor,
                    long prepaymentMinor, long refundedMinor, Instant createdAt, Instant approvedAt,
                    Instant shippedAt, Instant rejectedAt, Instant returnedAt, boolean paid,
                    Instant paidAt, boolean paidOnline, String rejectReason, String rejectReasonCode,
                    String cancelRequestStatus, String cancelRequestReason, Instant cancelRequestedAt) {
        this(id, status, customerName, totalMinor, receivedMinor, prepaymentMinor, refundedMinor, createdAt,
                approvedAt, shippedAt, rejectedAt, returnedAt, paid, paidAt, paidOnline, rejectReason,
                rejectReasonCode, cancelRequestStatus, cancelRequestReason, cancelRequestedAt, null);
    }

    /** Without a cancellation request (older callers / tests). */
    public InboxOrderRow(String id, OrderStatus status, String customerName, long totalMinor, long receivedMinor,
                    long prepaymentMinor, long refundedMinor, Instant createdAt, Instant approvedAt,
                    Instant shippedAt, Instant rejectedAt, Instant returnedAt, boolean paid,
                    Instant paidAt, boolean paidOnline, String rejectReason, String rejectReasonCode) {
        this(id, status, customerName, totalMinor, receivedMinor, prepaymentMinor, refundedMinor, createdAt,
                approvedAt, shippedAt, rejectedAt, returnedAt, paid, paidAt, paidOnline, rejectReason,
                rejectReasonCode, null, null, null, null);
    }
}
