package com.maxsolch.shop.returns.app;

import com.maxsolch.shop.order.app.AdminOrderQueries;
import com.maxsolch.shop.order.app.OrderChange;
import com.maxsolch.shop.order.app.OrderLookup;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderErrors;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.payment.app.OnlinePaymentService;
import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.returns.domain.ReturnPlan;
import com.maxsolch.shop.returns.domain.WizardLine;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * What the admin does with returns, one method per button: loads the order of the URL, runs the scenario and
 * writes the audit entry after the scenario's transaction has committed. The controller only turns the request
 * into these arguments and the returned order into a page.
 *
 * <p>Not {@code @Transactional}: the wizard moves money through the bank between two separate transactions of
 * {@link Returns}, and the audit entries are written on their own. Only one wizard per order runs at a time on this
 * instance ({@link #inFlight}); a second submit is refused rather than queued. The lock is in memory, so it does
 * not cover a second backend instance.
 */
@Service
public class AdminReturns {

    private final AdminOrderQueries queries;
    private final OrderLookup orders;
    private final Returns returns;
    private final ReturnReceiving receiving;
    private final Exchanges exchanges;
    private final ReturnCancellation cancellation;
    private final OnlinePaymentService payments;
    private final AdminAuditService audit;

    /** Orders whose return wizard is running right now (one backend instance): no double submit. */
    private final Set<String> inFlight = ConcurrentHashMap.newKeySet();

    public AdminReturns(AdminOrderQueries queries, OrderLookup orders, Returns returns, ReturnReceiving receiving,
                        Exchanges exchanges, ReturnCancellation cancellation, OnlinePaymentService payments,
                        AdminAuditService audit) {
        this.queries = queries;
        this.orders = orders;
        this.returns = returns;
        this.receiving = receiving;
        this.exchanges = exchanges;
        this.cancellation = cancellation;
        this.payments = payments;
        this.audit = audit;
    }

    /** The simple return: units and one refund. */
    public Order registerReturn(String id, List<Returns.ReturnLine> lines, long refundMinor, String note) {
        OrderChange r = returns.register(queries.load(id).getId(), lines, refundMinor, note);
        audit.record("ORDER_RETURN", "ORDER", id, r.auditDetails());
        return r.order();
    }

    /**
     * The return wizard (V68) for order {@code id}: the goods and the manual refunds are saved first; a refund through
     * monobank is requested after the plan is checked (it is an outside call) and booked when the bank confirms — so
     * it is never counted twice. Returns the order as it is after the return.
     */
    public Order registerPlan(String id, ReturnPlan plan) {
        Order order = queries.load(id);
        long mono = plan.monoRefundMinor();
        String key = UuidUtil.toString(order.getId());
        if (!inFlight.add(key)) {
            throw OrderErrors.badRequest("возврат по этому заказу уже оформляется — дождитесь окончания");
        }
        try {
            // Check first, then the bank, then the books: a refused plan sends no money, and a refund
            // monobank refuses leaves nothing half-saved to be entered twice on a retry.
            returns.checkPlan(order.getId(), plan);
            if (mono > 0) {
                String monoInvoice = payments.refundableInvoice(order.getId(), mono);
                try {
                    payments.refund(order.getId(), monoInvoice, mono);
                } catch (DomainException.BadRequest e) {
                    throw OrderErrors.badRequest("monobank не принял возврат денег: " + e.getMessage()
                            + ". Ничего не сохранено — исправьте и повторите.", "MONO_REFUND_FAILED");
                }
                audit.record("ORDER_REFUND_ONLINE", "ORDER", id,
                        "возврат на карту через monobank " + MoneyFormat.uah(mono) + " (мастер возврата)");
            }
            OrderChange r = returns.registerPlan(order.getId(), plan, audit.currentAdminName(), mono > 0);
            audit.record("ORDER_RETURN", "ORDER", id, r.auditDetails());
        } finally {
            inFlight.remove(key);
        }
        return orders.get(order.getId());
    }

    /** The refused / returned parcel is back at the shop. */
    public Order receive(String id, List<ReturnReceiving.ReceivedLine> lines, String note) {
        OrderChange r = receiving.receive(queries.load(id).getId(), lines, note, audit.currentAdminName());
        audit.record("ORDER_RETURN_RECEIVED", "ORDER", id, r.auditDetails());
        return r.order();
    }

    /** An exchange on a delivered order; returns the replacement order. */
    public Order exchange(String id, List<WizardLine> returned, List<Exchanges.NewLine> given, OrderStatus target,
                          boolean notifyCustomer, String note) {
        OrderChange r = exchanges.exchange(queries.load(id).getId(), returned, given, target, notifyCustomer, note,
                audit.currentAdminName());
        audit.record("ORDER_EXCHANGE", "ORDER", id, r.auditDetails());
        return r.order();
    }

    /** Cancels the newest return or exchange; returns the order as it is stored afterwards. */
    public Order cancel(String id, long returnId, ReturnCancellation.CancelMoney money, String note) {
        OrderChange r = cancellation.cancel(queries.load(id).getId(), returnId, money, note, audit.currentAdminName());
        audit.record("ORDER_RETURN_CANCEL", "ORDER", id, r.auditDetails());
        return orders.get(r.order().getId());
    }

    /** The customer sent back the money of a cancelled return. */
    public Order debtPaid(String id, long returnId) {
        OrderChange r = cancellation.settleDebt(queries.load(id).getId(), returnId, audit.currentAdminName());
        audit.record("ORDER_RETURN_DEBT_PAID", "ORDER", id, r.auditDetails());
        return r.order();
    }
}
