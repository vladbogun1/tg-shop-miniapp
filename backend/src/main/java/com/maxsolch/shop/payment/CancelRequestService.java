package com.maxsolch.shop.payment;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.service.OrderService;
import com.maxsolch.shop.web.BadRequestException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Customer cancellation of orders (docs/ORDERS-SUPPORT-REVIEWS.md, phase A).
 *
 * <ul>
 *   <li>unpaid → {@link #cancelUnpaid}: rejected at once, restocked, open payment pages closed;</li>
 *   <li>paid → {@link #request}: a request an admin {@link #approve approves} (reject + restock +
 *       full refund of every paid monobank invoice) or {@link #decline declines}.</li>
 * </ul>
 * Never inside a database transaction itself: the order changes run in {@link OrderService}'s
 * transactions, monobank is called before / after them.
 */
@Slf4j
@Service
public class CancelRequestService {

    /** Error code: the bank is processing a payment of this order right now. */
    public static final String PAYMENT_IN_PROGRESS = "PAYMENT_IN_PROGRESS";

    private final OrderService orderService;
    private final OnlinePaymentService payments;
    private final PaymentInvoiceRepository invoices;
    private final Messages messages;

    public CancelRequestService(OrderService orderService, OnlinePaymentService payments,
                                PaymentInvoiceRepository invoices, Messages messages) {
        this.orderService = orderService;
        this.payments = payments;
        this.invoices = invoices;
        this.messages = messages;
    }

    /** What happened to the money on approval. */
    public record ApproveResult(Order order, long refundRequestedMinor, int refundedInvoices,
                                List<String> refundErrors, long manualRefundMinor) {
    }

    /** Immediate cancel of an unpaid order by its customer. */
    public Order cancelUnpaid(byte[] orderId, String reason) {
        requireNoPaymentInFlight(orderId);
        Order cancelled = orderService.cancelByCustomer(orderId, reason);
        payments.closeOpenInvoices(orderId);
        return cancelled;
    }

    /** The customer files a cancellation request for a paid order. */
    public Order request(byte[] orderId, String reason) {
        requireNoPaymentInFlight(orderId);
        return orderService.requestCancel(orderId, reason);
    }

    /**
     * Admin approves: the order is rejected (CHANGED_MIND) and restocked in one transaction, then
     * every paid monobank invoice is refunded in full. A refund monobank refuses does not undo the
     * cancellation — it is reported back (and stays on «Внимание» as "cancelled, return the money").
     */
    public ApproveResult approve(byte[] orderId, String comment) {
        payments.refreshOrder(orderId);
        if (payments.hasPaymentInFlight(orderId)) {
            throw new BadRequestException("банк ещё обрабатывает платёж по заказу — подождите минуту", PAYMENT_IN_PROGRESS);
        }
        Order order = orderService.approveCancelRequest(orderId, comment);
        payments.closeOpenInvoices(orderId);

        long requested = 0;
        long onlineReceived = 0;
        int refunded = 0;
        List<String> errors = new ArrayList<>();
        for (PaymentInvoice inv : invoices.findByOrderIdOrderByCreatedAtDesc(orderId)) {
            if (inv.getAppliedAt() == null) {
                continue;
            }
            onlineReceived += inv.getAmountMinor();
            long left = inv.getAmountMinor() - Math.max(0, inv.getRefundedMinor());
            if (left <= 0 || inv.getRefundPendingUntil() != null) {
                continue;
            }
            try {
                payments.refund(orderId, inv.getExternalId(), null);
                requested += left;
                refunded++;
            } catch (RuntimeException e) {
                log.warn("Refund of invoice {} (order {}) failed: {}", inv.getExternalId(),
                        UuidUtil.toString(orderId), e.getMessage());
                errors.add(inv.getExternalId() + ": " + e.getMessage());
            }
        }
        // Money the admin recorded by hand (not through monobank) has to go back by hand too.
        long manual = Math.max(0, Math.min(order.getReceivedMinor(), order.getTotalMinor()) - onlineReceived);
        return new ApproveResult(orderService.get(orderId), requested, refunded, errors, manual);
    }

    /** Admin declines with a comment for the customer. */
    public Order decline(byte[] orderId, String comment) {
        return orderService.declineCancelRequest(orderId, comment);
    }

    private void requireNoPaymentInFlight(byte[] orderId) {
        // The bank may be charging the card right now: let that settle first.
        payments.refreshOrder(orderId);
        if (payments.hasPaymentInFlight(orderId)) {
            throw new BadRequestException(messages.current("api.payment.inProgress"), PAYMENT_IN_PROGRESS);
        }
    }
}
