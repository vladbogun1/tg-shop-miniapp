package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.payment.domain.MonobankGateway;
import com.maxsolch.shop.payment.domain.PaymentErrors;
import com.maxsolch.shop.payment.domain.PaymentInvoice;
import com.maxsolch.shop.payment.infra.PaymentInvoiceRepository;
import com.maxsolch.shop.payment.infra.WebhookLogStore;
import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

/** What an admin does with the online payments of an order, and the integration health card. */
@Service
public class AdminPayments {

    /**
     * Integration status for the payment settings screen.
     *
     * @param merchantName from monobank (null when the token is missing or rejected)
     * @param error        what went wrong talking to monobank
     */
    public record MonobankStatusDto(boolean enabled, String merchantName, String error,
                                    Instant lastWebhookAt, Boolean lastWebhookSignatureOk) {
    }

    private final OnlinePaymentService payments;
    private final PaymentInvoiceRepository invoices;
    private final MonobankGateway monobank;
    private final ReceiptService receipts;
    private final WebhookLogStore webhookLog;
    private final AdminAuditService audit;
    private final Clock clock;

    public AdminPayments(OnlinePaymentService payments, PaymentInvoiceRepository invoices, MonobankGateway monobank,
                         ReceiptService receipts, WebhookLogStore webhookLog, AdminAuditService audit, Clock clock) {
        this.payments = payments;
        this.invoices = invoices;
        this.monobank = monobank;
        this.receipts = receipts;
        this.webhookLog = webhookLog;
        this.audit = audit;
        this.clock = clock;
    }

    /** monobank invoices of the order, newest first. */
    public List<AdminInvoiceDto> invoices(String orderId) {
        return invoices.findByOrderIdOrderByCreatedAtDesc(orderId(orderId)).stream().map(this::toDto).toList();
    }

    /** Payment receipts of the order (fiscal checks + bank receipt) with signed download links. */
    public List<ReceiptDto> receipts(String orderId) {
        return receipts.forOrder(orderId(orderId));
    }

    /** Asks monobank for the current state of the order's invoices. */
    public List<AdminInvoiceDto> refresh(String orderId) {
        payments.refreshOrder(orderId(orderId));
        return invoices(orderId);
    }

    /** Refunds a paid invoice to the card — all that is left, or {@code amountMinor}. Audited. */
    public List<AdminInvoiceDto> refund(String orderId, String invoiceId, Long amountMinor) {
        payments.refund(orderId(orderId), invoiceId, amountMinor);
        audit.record("ORDER_REFUND_ONLINE", "ORDER", orderId,
                "счёт " + invoiceId + ", " + (amountMinor == null ? "полностью" : MoneyFormat.uah(amountMinor)));
        return invoices(orderId);
    }

    /** Is monobank configured and reachable; the last webhook received. */
    public MonobankStatusDto monobankStatus() {
        String merchant = null;
        String error = null;
        if (monobank.isEnabled()) {
            try {
                merchant = monobank.details().merchantName();
            } catch (MonobankGateway.MonobankException e) {
                error = e.getMessage();
            }
        }
        WebhookLogStore.LastWebhook last = webhookLog.last().orElse(null);
        return new MonobankStatusDto(monobank.isEnabled(), merchant, error,
                last == null ? null : last.receivedAt(), last == null ? null : last.signatureOk());
    }

    private AdminInvoiceDto toDto(PaymentInvoice i) {
        return new AdminInvoiceDto(i.getExternalId(), i.getStatus(), i.getAmountMinor(), i.getFinalAmountMinor(),
                i.getRefundedMinor(), i.getPageUrl(), i.getExpiresAt(), i.getMaskedPan(), i.getPaymentMethod(),
                i.getPaymentSystem(), i.getRrn(), i.getApprovalCode(), i.getFeeMinor(), i.getFailureReason(),
                i.getErrCode(), i.getAppliedAt(),
                i.getRefundPendingUntil() != null && i.getRefundPendingUntil().isAfter(clock.instant()),
                i.getCreatedAt(), i.getUpdatedAt());
    }

    private static byte[] orderId(String id) {
        try {
            return UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            throw PaymentErrors.notFound("заказ не найден");
        }
    }
}
