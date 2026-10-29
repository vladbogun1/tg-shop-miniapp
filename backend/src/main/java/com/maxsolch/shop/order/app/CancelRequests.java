package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.CancelRequestStatus;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderErrors;
import com.maxsolch.shop.order.domain.OrderTransitions;
import com.maxsolch.shop.order.domain.RejectCause;
import com.maxsolch.shop.order.domain.RejectReasonCode;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.i18n.CustomerRejectReason;
import com.maxsolch.shop.platform.i18n.Messages;
import org.springframework.context.ApplicationEventPublisher;
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

    /** Error code: the order is paid, so the customer has to file a cancellation request. */
    public static final String PAID_NEEDS_REQUEST = "PAID_NEEDS_REQUEST";
    /** Error code: the order is past the point where the customer may cancel it (shipped, closed). */
    public static final String CANNOT_CANCEL = "CANNOT_CANCEL";
    /** Error code: a cancellation request already exists for this order (pending or resolved). */
    public static final String CANCEL_REQUEST_EXISTS = "CANCEL_REQUEST_EXISTS";
    /** Error code: the order is not paid, so cancel it directly instead of requesting. */
    public static final String CANCEL_REQUEST_UNPAID = "CANCEL_REQUEST_UNPAID";
    /** Error code: the admin action needs a PENDING request. */
    public static final String NO_PENDING_REQUEST = "NO_PENDING_REQUEST";

    private final OrderOps ops;
    private final OrderRepository orderRepository;
    private final OrderStock stock;
    private final ApplicationEventPublisher events;
    private final Messages messages;

    CancelRequests(OrderOps ops, OrderRepository orderRepository, OrderStock stock, ApplicationEventPublisher events,
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
            throw OrderErrors.badRequest(messages.current("api.order.paidCannotCancel"), PAID_NEEDS_REQUEST);
        }
        if (!order.isOpen()) {
            throw OrderErrors.badRequest(messages.current("api.order.cannotCancel"), CANNOT_CANCEL);
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
            throw OrderErrors.badRequest(messages.current("api.cancelRequest.reasonRequired"));
        }
        if (r.length() > 500) {
            throw OrderErrors.badRequest(messages.current("api.cancelRequest.reasonTooLong", 500));
        }
        if (order.getCancelRequestStatus() != null) {
            throw OrderErrors.badRequest(messages.current(
                    CancelRequestStatus.DECLINED.name().equals(order.getCancelRequestStatus())
                            ? "api.cancelRequest.declinedBefore" : "api.cancelRequest.exists"),
                    CANCEL_REQUEST_EXISTS);
        }
        if (!OrderTransitions.isOpen(order)) {
            throw OrderErrors.badRequest(messages.current("api.order.cannotCancel"), CANNOT_CANCEL);
        }
        if (!order.isPaid() && order.getReceivedMinor() <= 0) {
            throw OrderErrors.badRequest(messages.current("api.cancelRequest.unpaid"), CANCEL_REQUEST_UNPAID);
        }
        order.setCancelRequestStatus(CancelRequestStatus.PENDING.name());
        order.setCancelRequestReason(r);
        order.setCancelRequestedAt(ops.now());
        order.setCancelRequestResolvedAt(null);
        order.setCancelRequestAdminComment(null);
        Order saved = orderRepository.save(order);
        events.publishEvent(new OrderEvents.CancelRequested(saved.getId()));
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
            throw OrderErrors.badRequest("заказ уже " + order.getStatus() + " — отмена по запросу невозможна",
                    CANNOT_CANCEL);
        }
        Instant now = ops.now();
        stock.restoreAll(order);
        order.setCancelRequestStatus(CancelRequestStatus.APPROVED.name());
        order.setCancelRequestResolvedAt(now);
        order.setCancelRequestAdminComment(comment == null || comment.isBlank() ? null : comment.trim());
        Order saved = ops.reject(order, new RejectCause(now,
                byRequestReason(order.getCancelRequestReason()),
                RejectReasonCode.CHANGED_MIND.name(), true));
        events.publishEvent(new OrderEvents.CancelRequestResolved(saved.getId(), true));
        return saved;
    }

    /** Admin declines a pending request; the comment (required) is shown to the customer. */
    @Transactional
    public Order declineCancelRequest(byte[] orderId, String comment) {
        Order order = ops.lock(orderId);
        requirePendingRequest(order);
        String c = comment == null ? "" : comment.trim();
        if (c.isEmpty()) {
            throw OrderErrors.badRequest("напишите покупателю, почему отмена невозможна");
        }
        if (c.length() > 1000) {
            throw OrderErrors.badRequest("комментарий длиннее 1000 символов");
        }
        order.setCancelRequestStatus(CancelRequestStatus.DECLINED.name());
        order.setCancelRequestResolvedAt(ops.now());
        order.setCancelRequestAdminComment(c);
        Order saved = orderRepository.save(order);
        events.publishEvent(new OrderEvents.CancelRequestResolved(saved.getId(), false));
        return saved;
    }

    private static void requirePendingRequest(Order order) {
        if (!order.isCancelRequestPending()) {
            throw OrderErrors.badRequest("нет активного запроса отмены", NO_PENDING_REQUEST);
        }
    }

    /** "Отменён по запросу покупателя: причина", without a dangling colon when the reason is empty. */
    private static String byRequestReason(String requestReason) {
        return requestReason == null || requestReason.isBlank()
                ? CustomerRejectReason.BY_REQUEST
                : CustomerRejectReason.BY_REQUEST + ": " + requestReason;
    }
}
