package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.payment.MonobankClient;
import com.maxsolch.shop.payment.OnlinePaymentService;
import com.maxsolch.shop.payment.PaymentInvoice;
import com.maxsolch.shop.payment.PaymentInvoiceRepository;
import com.maxsolch.shop.payment.ReceiptService;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.dto.AdminInvoiceDto;
import com.maxsolch.shop.web.dto.ReceiptDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/** monobank invoices of an order (status, card, refunds) and the integration health card. */
@RestController
@RequestMapping("/api/admin")
@RequiredAdmin
@Tag(name = "Admin Online Payment", description = "monobank invoices, refunds, integration status")
@SecurityRequirement(name = "bearer-jwt")
public class AdminOnlinePaymentController {

    private final OnlinePaymentService payments;
    private final PaymentInvoiceRepository invoices;
    private final MonobankClient monobank;
    private final AdminAuditService audit;
    private final JdbcTemplate jdbc;
    private final ReceiptService receipts;

    public AdminOnlinePaymentController(OnlinePaymentService payments, PaymentInvoiceRepository invoices,
                                        MonobankClient monobank, AdminAuditService audit, JdbcTemplate jdbc,
                                        ReceiptService receipts) {
        this.receipts = receipts;
        this.payments = payments;
        this.invoices = invoices;
        this.monobank = monobank;
        this.audit = audit;
        this.jdbc = jdbc;
    }

    /** Refund request: {@code amountMinor} null = everything left on that invoice. */
    public record RefundRequest(Long amountMinor) {
    }

    /**
     * Integration status for the payment settings screen.
     *
     * @param merchantName from monobank (null when the token is missing or rejected)
     * @param error        what went wrong talking to monobank
     */
    public record MonobankStatusDto(boolean enabled, String merchantName, String error,
                                    Instant lastWebhookAt, Boolean lastWebhookSignatureOk) {
    }

    @GetMapping("/orders/{id}/payments")
    @Operation(summary = "monobank invoices of the order, newest first")
    public List<AdminInvoiceDto> list(@PathVariable String id) {
        return invoices.findByOrderIdOrderByCreatedAtDesc(orderId(id)).stream().map(this::toDto).toList();
    }

    @GetMapping("/orders/{id}/receipts")
    @Operation(summary = "Payment receipts of the order (fiscal checks + bank receipt) with signed download links")
    public List<ReceiptDto> receipts(@PathVariable String id) {
        return receipts.forOrder(orderId(id));
    }

    @PostMapping("/orders/{id}/payments/refresh")
    @Operation(summary = "Ask monobank for the current state of the order's invoices")
    public List<AdminInvoiceDto> refresh(@PathVariable String id) {
        byte[] orderId = orderId(id);
        payments.refreshOrder(orderId);
        return list(id);
    }

    @PostMapping("/orders/{id}/payments/{invoiceId}/refund")
    @Operation(summary = "Refund a paid invoice to the card (all that is left, or amountMinor)")
    public List<AdminInvoiceDto> refund(@PathVariable String id, @PathVariable String invoiceId,
                                        @RequestBody(required = false) RefundRequest req) {
        byte[] orderId = orderId(id);
        Long amount = req == null ? null : req.amountMinor();
        payments.refund(orderId, invoiceId, amount);
        audit.record("ORDER_REFUND_ONLINE", "order", id,
                "invoice " + invoiceId + ", " + (amount == null ? "full" : amount / 100.0 + " UAH"));
        return list(id);
    }

    @GetMapping("/payments/monobank/status")
    @Operation(summary = "Is monobank configured and reachable; the last webhook received")
    public MonobankStatusDto status() {
        String merchant = null;
        String error = null;
        if (monobank.isEnabled()) {
            try {
                merchant = monobank.details().merchantName();
            } catch (MonobankClient.MonobankException e) {
                error = e.getMessage();
            }
        }
        List<Map<String, Object>> last = jdbc.queryForList(
                "select received_at, signature_ok from payment_webhook_log order by id desc limit 1");
        Instant lastAt = null;
        Boolean lastOk = null;
        if (!last.isEmpty()) {
            Object at = last.get(0).get("received_at");
            lastAt = at instanceof Timestamp ts ? ts.toInstant()
                    : at instanceof java.time.LocalDateTime ldt ? ldt.atZone(java.time.ZoneId.systemDefault()).toInstant() : null;
            Object ok = last.get(0).get("signature_ok");
            lastOk = ok instanceof Boolean b ? b : ok instanceof Number n ? n.intValue() != 0 : null;
        }
        return new MonobankStatusDto(monobank.isEnabled(), merchant, error, lastAt, lastOk);
    }

    private AdminInvoiceDto toDto(PaymentInvoice i) {
        return new AdminInvoiceDto(i.getExternalId(), i.getStatus(), i.getAmountMinor(), i.getFinalAmountMinor(),
                i.getRefundedMinor(), i.getPageUrl(), i.getExpiresAt(), i.getMaskedPan(), i.getPaymentMethod(),
                i.getPaymentSystem(), i.getRrn(), i.getApprovalCode(), i.getFeeMinor(), i.getFailureReason(),
                i.getErrCode(), i.getAppliedAt(),
                i.getRefundPendingUntil() != null && i.getRefundPendingUntil().isAfter(Instant.now()),
                i.getCreatedAt(), i.getUpdatedAt());
    }

    private static byte[] orderId(String id) {
        try {
            return UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            throw new NotFoundException("order not found");
        }
    }
}
