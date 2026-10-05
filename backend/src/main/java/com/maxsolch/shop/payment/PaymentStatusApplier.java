package com.maxsolch.shop.payment;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.service.OrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

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
            return true;
        }
        if (modified != null) {
            inv.setProviderModifiedAt(modified);
        }
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
        }
        if (inv.getAppliedAt() != null) {
            long refundedNow = refundedFrom(st, inv);
            long delta = refundedNow - inv.getRefundedMinor();
            if (delta > 0) {
                inv.setRefundedMinor(refundedNow);
                orderService.recordOnlineRefund(inv.getOrderId(), delta);
                log.info("monobank: invoice {} refund {} kop booked", inv.getExternalId(), delta);
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


    private static String cut(String s, int max) {
        return s == null ? null : s.length() <= max ? s : s.substring(0, max);
    }
}
