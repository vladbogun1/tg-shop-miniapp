package com.maxsolch.shop.returns.app;

import com.maxsolch.shop.returns.domain.ReturnsError;
import com.maxsolch.shop.order.app.AdminOrderQueries;
import com.maxsolch.shop.order.app.OrderChange;
import com.maxsolch.shop.order.app.OrderLookup;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.app.OrderOnlinePayments;
import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.jobs.DbLocks;
import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.returns.domain.ReturnPlan;
import com.maxsolch.shop.returns.domain.WizardLine;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;


/**
 * What the admin does with returns, one method per button: loads the order of the URL, runs the scenario and
 * writes the audit entry after the scenario's transaction has committed. The controller only turns the request
 * into these arguments and the returned order into a page.
 *
 * <p>Not {@code @Transactional}: the wizard moves money through the bank between two separate transactions of
 * {@link Returns}, and the audit entries are written on their own. Only one wizard per order runs at a time on any
 * instance (a database lock, {@link DbLocks}); a second submit is refused rather than queued.
 */
@Slf4j
@Service
public class AdminReturns {

    private final AdminOrderQueries queries;
    private final OrderLookup orders;
    private final Returns returns;
    private final ReturnReceiving receiving;
    private final Exchanges exchanges;
    private final ReturnCancellation cancellation;
    private final OrderOnlinePayments payments;
    private final AdminAuditService audit;
    private final DefectWriteoffs defects;

    /** Tries to write the plan down this many times after the bank has already paid out. */
    private static final int BOOK_ATTEMPTS = 3;
    private final DbLocks locks;

    public AdminReturns(AdminOrderQueries queries, OrderLookup orders, Returns returns, ReturnReceiving receiving,
                        Exchanges exchanges, ReturnCancellation cancellation, OrderOnlinePayments payments,
                        AdminAuditService audit, DefectWriteoffs defects, DbLocks locks) {
        this.locks = locks;
        this.queries = queries;
        this.orders = orders;
        this.returns = returns;
        this.receiving = receiving;
        this.exchanges = exchanges;
        this.cancellation = cancellation;
        this.payments = payments;
        this.audit = audit;
        this.defects = defects;
    }

    /** A written-off unit turned out fine: back on the shelf (the write-off stays, marked). Returns the audit summary. */
    public String restoreWriteoff(long writeoffId, int quantity, String note) {
        String summary = defects.restore(writeoffId, quantity, note, audit.currentAdminName());
        audit.record("STOCK_WRITEOFF_RESTORE", "STOCK_WRITEOFF", String.valueOf(writeoffId), summary);
        return summary;
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
        DbLocks.Held held = locks.tryLock(OrderOnlinePayments.RETURN_LOCK + key, OrderOnlinePayments.RETURN_LOCK_TTL)
                .orElseThrow(() -> new DomainException.BadRequest(ReturnsError.RETURN_IN_PROGRESS));
        try {
            // Check first, then the bank, then the books: a refused plan sends no money, and a refund
            // monobank refuses leaves nothing half-saved to be entered twice on a retry.
            returns.checkPlan(order.getId(), plan);
            if (mono > 0) {
                String monoInvoice = payments.refundableInvoice(order.getId(), mono);
                try {
                    payments.refundHeld(order.getId(), monoInvoice, mono);
                } catch (DomainException.BadRequest e) {
                    throw new DomainException.BadRequest(ReturnsError.MONO_REFUND_FAILED, e.getMessage());
                }
                auditQuietly("ORDER_REFUND_ONLINE", id,
                        "возврат на карту через monobank " + MoneyFormat.uah(mono) + " (мастер возврата)");
            }
            OrderChange r = mono > 0 ? bookAfterBank(order, plan, mono, id)
                    : returns.registerPlan(order.getId(), plan, audit.currentAdminName(), false);
            auditQuietly("ORDER_RETURN", id, r.auditDetails());
        } finally {
            held.release();
        }
        return orders.get(order.getId());
    }

    /**
     * The bank has paid out, so the goods and manual refunds are saved even through a short database hiccup: the
     * write is one transaction, so a failed attempt left nothing and can simply be repeated. If it still fails, the
     * admin gets a message that says the money has gone (a repeat would send it again) and the audit log keeps the fact.
     */
    private OrderChange bookAfterBank(Order order, ReturnPlan plan, long mono, String id) {
        RuntimeException last = null;
        for (int attempt = 1; attempt <= BOOK_ATTEMPTS; attempt++) {
            try {
                return returns.registerPlan(order.getId(), plan, audit.currentAdminName(), true);
            } catch (RuntimeException e) {
                last = e;
                log.warn("return of order {} after the bank refund: attempt {} failed: {}", id, attempt, e.getMessage());
            }
        }
        auditQuietly("ORDER_REFUND_ONLINE_UNBOOKED", id, "monobank вернул " + MoneyFormat.uah(mono)
                + ", но возврат (товар, остатки, строки) не записан: " + last.getMessage());
        throw new DomainException.BadRequest(ReturnsError.MONO_REFUND_SENT_NOT_BOOKED, MoneyFormat.uah(mono));
    }

    /** After the money moved a failed audit line must not look like a failed return. */
    private void auditQuietly(String action, String orderId, String details) {
        try {
            audit.record(action, "ORDER", orderId, details);
        } catch (RuntimeException e) {
            log.error("audit {} of order {} not written: {}", action, orderId, e.getMessage());
        }
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
