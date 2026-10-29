package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.order.domain.OrderErrors;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Customer cancellation of orders (docs/ORDERS-SUPPORT-REVIEWS.md, phase A).
 *
 * <ul>
 *   <li>unpaid → {@link #cancelUnpaid}: rejected at once, restocked, open payment pages closed;</li>
 *   <li>paid → {@link #request}: a request an admin {@link #approve approves} (reject + restock +
 *       full refund of every paid monobank invoice) or {@link #decline declines}.</li>
 * </ul>
 * Never inside a database transaction itself: the order changes run in {@link CancelRequests}'
 * transactions, monobank is called before / after them.
 */
@Service
public class CancelRequestService {

    /** Error code: the bank is processing a payment of this order right now. */
    public static final String PAYMENT_IN_PROGRESS = "PAYMENT_IN_PROGRESS";

    private final OrderLookup orderQueries;
    private final CancelRequests cancelRequests;
    private final OrderOnlinePayments payments;
    private final Messages messages;

    public CancelRequestService(OrderLookup orderQueries, CancelRequests cancelRequests, OrderOnlinePayments payments,
                                Messages messages) {
        this.orderQueries = orderQueries;
        this.cancelRequests = cancelRequests;
        this.payments = payments;
        this.messages = messages;
    }

    /** What happened to the money on approval. */
    public record ApproveResult(Order order, long refundRequestedMinor, int refundedInvoices,
                                List<String> refundErrors, long manualRefundMinor) {
    }

    /** Immediate cancel of an unpaid order by its customer. */
    public Order cancelUnpaid(byte[] orderId, String reason) {
        requireNoPaymentInFlight(orderId);
        Order cancelled = cancelRequests.cancelByCustomer(orderId, reason);
        payments.closeOpenInvoices(orderId);
        return cancelled;
    }

    /** The customer files a cancellation request for a paid order. */
    public Order request(byte[] orderId, String reason) {
        requireNoPaymentInFlight(orderId);
        return cancelRequests.requestCancel(orderId, reason);
    }

    /**
     * Admin approves: the order is rejected (CHANGED_MIND) and restocked in one transaction, then
     * every paid monobank invoice is refunded in full. A refund monobank refuses does not undo the
     * cancellation — it is reported back (and stays on «Внимание» as "cancelled, return the money").
     */
    public ApproveResult approve(byte[] orderId, String comment) {
        payments.refresh(orderId);
        if (payments.hasPaymentInFlight(orderId)) {
            throw OrderErrors.badRequest("банк ещё обрабатывает платёж по заказу — подождите минуту", PAYMENT_IN_PROGRESS);
        }
        Order order = cancelRequests.approveCancelRequest(orderId, comment);
        payments.closeOpenInvoices(orderId);

        OrderOnlinePayments.RefundAll refund = payments.refundAll(orderId);
        // Money the admin recorded by hand (not through monobank) has to go back by hand too.
        long manual = Math.max(0, OrderMoney.receivedMinor(order) - refund.onlineReceivedMinor());
        return new ApproveResult(orderQueries.get(orderId), refund.requestedMinor(), refund.refundedInvoices(), refund.errors(), manual);
    }

    /** Admin declines with a comment for the customer. */
    public Order decline(byte[] orderId, String comment) {
        return cancelRequests.declineCancelRequest(orderId, comment);
    }

    private void requireNoPaymentInFlight(byte[] orderId) {
        // The bank may be charging the card right now: let that settle first.
        payments.refresh(orderId);
        if (payments.hasPaymentInFlight(orderId)) {
            throw OrderErrors.badRequest(messages.current("api.payment.inProgress"), PAYMENT_IN_PROGRESS);
        }
    }
}
