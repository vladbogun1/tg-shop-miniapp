package com.maxsolch.shop.order.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.order.domain.OrderError;
import com.maxsolch.shop.order.domain.OrderEvents;

import com.maxsolch.shop.order.domain.CancelRequestStatus;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderTransitions;
import com.maxsolch.shop.order.domain.RejectCause;
import com.maxsolch.shop.order.domain.RejectReasonCode;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.i18n.CustomerRejectReason;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.tx.DomainEvents;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/**
 * The customer way out of an order that has not shipped: cancel it at once while unpaid, or file a
 * cancellation request once money has arrived and let an admin approve (reject + restock) or decline it.
 * These are the transactional order changes only; the money side (monobank refunds, closing payment pages)
 * runs outside any transaction in {@link CancelRequestService}, which is why that class is a separate bean.
 */
@Service
public class CancelRequests {


    private final OrderOps ops;
    private final OrderRepository orderRepository;
    private final OrderStock stock;
    private final DomainEvents events;
    private final Messages messages;

    CancelRequests(OrderOps ops, OrderRepository orderRepository, OrderStock stock, DomainEvents events,
                   Messages messages) {
        this.ops = ops;
        this.orderRepository = orderRepository;
        this.stock = stock;
        this.events = events;
        this.messages = messages;
    }

    /**
     * Customer-initiated cancellation: allowed only while the order is NOT paid and still NEW/APPROVED
     * (e.g. a card problem). Restores stock and moves the order to REJECTED with a customer reason.
     */
    @Transactional
    public Order cancelByCustomer(byte[] orderId, String reason) {
        Order order = ops.lock(orderId);
        if (order.isPaid() || order.getReceivedMinor() > 0) {
            // Paid orders go through a cancellation request (requestCancel) instead.
            throw new DomainException.BadRequest(OrderError.PAID_NEEDS_REQUEST);
        }
        if (!order.isOpen()) {
            throw new DomainException.BadRequest(OrderError.CANNOT_CANCEL);
        }
        stock.restoreAll(order);
        String r = reason == null ? "" : reason.trim();
        if (r.length() > 500) {
            r = r.substring(0, 500);
        }
        return ops.reject(order, new RejectCause(ops.now(),
                r.isBlank() ? CustomerRejectReason.BY_CUSTOMER : CustomerRejectReason.BY_CUSTOMER + ": " + r,
                RejectReasonCode.CHANGED_MIND.name(), true));
    }

    /**
     * The customer asks to cancel a PAID order that has not shipped yet. Nothing changes in the
     * order itself until an admin decides (approve = reject + restock + refund, decline = comment).
     * One request per order: a declined one cannot be filed again.
     */
    @Transactional
    public Order requestCancel(byte[] orderId, String reason) {
        Order order = ops.lock(orderId);
        String r = reason == null ? "" : reason.trim();
        if (r.isEmpty()) {
            throw new DomainException.BadRequest(OrderError.CANCEL_REASON_REQUIRED);
        }
        if (r.length() > 500) {
            throw new DomainException.BadRequest(OrderError.CANCEL_REASON_TOO_LONG, 500);
        }
        if (order.getCancelRequestStatus() != null) {
            throw (CancelRequestStatus.DECLINED.name().equals(order.getCancelRequestStatus()) ? new DomainException.BadRequest(OrderError.CANCEL_REQUEST_DECLINED_BEFORE) : new DomainException.BadRequest(OrderError.CANCEL_REQUEST_EXISTS));
        }
        if (!OrderTransitions.isOpen(order)) {
            throw new DomainException.BadRequest(OrderError.CANNOT_CANCEL);
        }
        if (!order.isPaid() && order.getReceivedMinor() <= 0) {
            throw new DomainException.BadRequest(OrderError.CANCEL_REQUEST_UNPAID);
        }
        order.requestCancel(r, ops.now());
        Order saved = orderRepository.save(order);
        events.publish(new OrderEvents.CancelRequested(saved.getId()));
        return saved;
    }

    /**
     * Admin approves a pending cancellation request: the order is rejected (CHANGED_MIND), the
     * goods go back to stock and the request is closed. The refund itself is made by the caller
     * after this transaction commits (monobank is never called inside a transaction).
     */
    @Transactional
    public Order approveCancelRequest(byte[] orderId, String comment) {
        Order order = ops.lock(orderId);
        requirePendingRequest(order);
        if (!OrderTransitions.isOpen(order)) {
            throw new DomainException.BadRequest(OrderError.CANNOT_CANCEL_BY_REQUEST, String.valueOf(order.getStatus()));
        }
        Instant now = ops.now();
        stock.restoreAll(order);
        order.approveCancelRequest(now, comment);
        Order saved = ops.reject(order, new RejectCause(now,
                byRequestReason(order.getCancelRequestReason()),
                RejectReasonCode.CHANGED_MIND.name(), true));
        events.publish(new OrderEvents.CancelRequestResolved(saved.getId(), true));
        return saved;
    }

    /** Admin declines a pending request; the comment (required) is shown to the customer. */
    @Transactional
    public Order declineCancelRequest(byte[] orderId, String comment) {
        Order order = ops.lock(orderId);
        requirePendingRequest(order);
        String c = comment == null ? "" : comment.trim();
        if (c.isEmpty()) {
            throw new DomainException.BadRequest(OrderError.DECLINE_REASON_REQUIRED);
        }
        if (c.length() > 1000) {
            throw new DomainException.BadRequest(OrderError.COMMENT_TOO_LONG_1000);
        }
        order.declineCancelRequest(ops.now(), c);
        Order saved = orderRepository.save(order);
        events.publish(new OrderEvents.CancelRequestResolved(saved.getId(), false));
        return saved;
    }

    private static void requirePendingRequest(Order order) {
        if (!order.isCancelRequestPending()) {
            throw new DomainException.BadRequest(OrderError.NO_PENDING_REQUEST);
        }
    }

    /** "Отменён по запросу покупателя: причина", without a dangling colon when the reason is empty. */
    private static String byRequestReason(String requestReason) {
        return requestReason == null || requestReason.isBlank()
                ? CustomerRejectReason.BY_REQUEST
                : CustomerRejectReason.BY_REQUEST + ": " + requestReason;
    }
}
