package com.maxsolch.shop.payment;

import com.maxsolch.shop.common.MoneyFormat;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.journal.ActivityLog;
import com.maxsolch.shop.service.OrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

import static com.maxsolch.shop.common.Texts.cut;

/**
 * The single place where a monobank invoice state (webhook body or status poll) changes our data.
 * Its own bean so the transaction applies when {@link OnlinePaymentService} calls it.
 *
 * <ul>
 *   <li>the invoice row is locked, so a webhook and a poll for it run one after another;</li>
 *   <li>a state older than the one held ({@code modifiedDate}) is ignored — webhooks may arrive
 *       out of order;</li>
 *   <li>amount/currency must match what we asked for, or nothing is applied;</li>
 *   <li>a success is credited to the order exactly once ({@code applied_at});</li>
 *   <li>refunds are booked from {@code finalAmount}, whoever made them (admin button or the
 *       monobank cabinet).</li>
 * </ul>
 */
@Slf4j
@Component
public class PaymentStatusApplier {

    private final PaymentInvoiceRepository invoices;
    private final OrderService orderService;

    public PaymentStatusApplier(PaymentInvoiceRepository invoices, OrderService orderService) {
        this.invoices = invoices;
        this.orderService = orderService;
    }

    /** «Журнал → Бот и сайт» (optional: tests build the applier without it). */
    private ActivityLog activity;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setActivity(ActivityLog activity) {
        this.activity = activity;
    }

    private void journal(ActivityLog.Entry entry) {
        if (activity != null) {
            activity.recordAfterCommit(entry);
        }
    }

    private static ActivityLog.Entry payment(String type, PaymentInvoice inv) {
        return ActivityLog.Entry.of(ActivityLog.PAYMENT, type).order(inv.getOrderId())
                .detail("invoice", inv.getExternalId())
                .detail("amountMinor", inv.getAmountMinor());
    }

    /**
     * Applies a monobank invoice state (webhook body or status poll). Returns false for an invoice
     * we do not know.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean apply(MonobankInvoiceStatus st) {
        if (st == null || st.invoiceId() == null || st.status() == null) {
            return false;
        }
        Optional<PaymentInvoice> found = invoices.findForUpdate(PaymentInvoice.PROVIDER_MONOBANK, st.invoiceId());
        if (found.isEmpty()) {
            log.warn("monobank status for unknown invoice {}", st.invoiceId());
            return false;
        }
        PaymentInvoice inv = found.get();
        Instant modified = OnlinePaymentService.parseDate(st.modifiedDate());
        if (modified != null && inv.getProviderModifiedAt() != null && modified.isBefore(inv.getProviderModifiedAt())) {
            log.info("monobank: stale {} for invoice {} ignored", st.status(), st.invoiceId());
            return true;
        }
        if (st.amount() != null && st.amount() != inv.getAmountMinor()
                || st.ccy() != null && st.ccy() != inv.getCcy()) {
            log.error("monobank: invoice {} amount/ccy mismatch: ours {} {}, theirs {} {} — NOT applied",
                    st.invoiceId(), inv.getAmountMinor(), inv.getCcy(), st.amount(), st.ccy());
            journal(payment("AMOUNT_MISMATCH", inv)
                    .text("monobank прислал другую сумму/валюту — статус НЕ применён")
                    .detail("theirAmount", st.amount()).detail("theirCcy", st.ccy())
                    .failed("AMOUNT_MISMATCH", "ours " + inv.getAmountMinor() + "/" + inv.getCcy()
                            + ", theirs " + st.amount() + "/" + st.ccy()));
            return true;
        }
        if (modified != null) {
            inv.setProviderModifiedAt(modified);
        }
        String before = inv.getStatus();
        // A later "created/processing" must never overwrite a final state of the same timestamp.
        if (!(inv.getAppliedAt() != null && PaymentInvoice.OPEN.contains(st.status()))) {
            inv.setStatus(st.status());
        }
        inv.setFailureReason(cut(st.failureReason(), 512));
        inv.setErrCode(cut(st.errCode(), 16));
        if (st.finalAmount() != null) {
            inv.setFinalAmountMinor(st.finalAmount());
        }
        if (st.paymentInfo() != null) {
            MonobankInvoiceStatus.PaymentInfo pi = st.paymentInfo();
            inv.setMaskedPan(cut(pi.maskedPan(), 32));
            inv.setPaymentMethod(cut(pi.paymentMethod(), 16));
            inv.setPaymentSystem(cut(pi.paymentSystem(), 16));
            inv.setRrn(cut(pi.rrn(), 64));
            inv.setApprovalCode(cut(pi.approvalCode(), 32));
            inv.setFeeMinor(pi.fee());
        }

        boolean paidState = PaymentInvoice.SUCCESS.equals(st.status()) || PaymentInvoice.REVERSED.equals(st.status());
        if (paidState && inv.getAppliedAt() == null) {
            inv.setAppliedAt(Instant.now());
            orderService.recordOnlinePayment(inv.getOrderId(), inv.getAmountMinor());
            log.info("monobank: invoice {} paid, {} kop credited to order {}", inv.getExternalId(),
                    inv.getAmountMinor(), UuidUtil.toString(inv.getOrderId()));
            journal(payment("PAYMENT_SUCCESS", inv)
                    .text("Оплата получена: " + MoneyFormat.amount(inv.getAmountMinor()) + " грн"
                            + (inv.getPaymentMethod() != null ? " · " + inv.getPaymentMethod() : "")
                            + (inv.getPaymentSystem() != null ? " " + inv.getPaymentSystem() : ""))
                    .detail("method", inv.getPaymentMethod())
                    .detail("system", inv.getPaymentSystem()));
        } else if (PaymentInvoice.FAILURE.equals(st.status()) && !PaymentInvoice.FAILURE.equals(before)) {
            journal(payment("PAYMENT_FAILURE", inv)
                    .text("Оплата не прошла: " + (st.failureReason() == null ? "без причины" : st.failureReason()))
                    .failed(st.errCode() == null || st.errCode().isBlank() ? "FAILURE" : "MONO_" + st.errCode(),
                            st.failureReason()));
        } else if (PaymentInvoice.EXPIRED.equals(st.status()) && !PaymentInvoice.EXPIRED.equals(before)
                && inv.getAppliedAt() == null) {
            journal(payment("INVOICE_EXPIRED", inv)
                    .text("Ссылка на оплату истекла неоплаченной").skipped("EXPIRED"));
        }
        if (inv.getAppliedAt() != null) {
            long refundedNow = refundedFrom(st, inv);
            long delta = refundedNow - inv.getRefundedMinor();
            if (delta > 0) {
                inv.setRefundedMinor(refundedNow);
                orderService.recordOnlineRefund(inv.getOrderId(), delta);
                log.info("monobank: invoice {} refund {} kop booked", inv.getExternalId(), delta);
                journal(payment("REFUND", inv)
                        .text("Возврат на карту: " + MoneyFormat.amount(delta) + " грн")
                        .detail("refundMinor", delta).detail("refundedTotalMinor", refundedNow));
            }
        }
        if (inv.getRefundPendingUntil() != null && !hasPendingCancel(st)) {
            inv.setRefundPendingUntil(null);
        }
        invoices.save(inv);
        return true;
    }

    /** How much of this invoice has gone back to the card. */
    private static long refundedFrom(MonobankInvoiceStatus st, PaymentInvoice inv) {
        if (st.finalAmount() != null) {
            return Math.max(0, inv.getAmountMinor() - st.finalAmount());
        }
        if (st.cancelList() != null) {
            return st.cancelList().stream()
                    .filter(c -> "success".equals(c.status()) && c.amount() != null)
                    .mapToLong(MonobankInvoiceStatus.CancelItem::amount).sum();
        }
        return inv.getRefundedMinor();
    }

    private static boolean hasPendingCancel(MonobankInvoiceStatus st) {
        return st.cancelList() != null && st.cancelList().stream().anyMatch(c -> "processing".equals(c.status()));
    }

}
