package com.maxsolch.shop.payment.api;

import com.maxsolch.shop.payment.app.AdminInvoiceDto;
import com.maxsolch.shop.payment.app.AdminPayments;
import com.maxsolch.shop.payment.app.ReceiptDto;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** monobank invoices of an order (status, card, refunds) and the integration health card. */
@RestController
@RequestMapping("/api/admin")
@RequiredAdmin
@Tag(name = "Admin Online Payment", description = "monobank invoices, refunds, integration status")
@SecurityRequirement(name = "bearer-jwt")
public class AdminOnlinePaymentController {

    private final AdminPayments adminPayments;

    public AdminOnlinePaymentController(AdminPayments adminPayments) {
        this.adminPayments = adminPayments;
    }

    /** Refund request: {@code amountMinor} null = everything left on that invoice. */
    public record RefundRequest(Long amountMinor) {
    }

    @GetMapping("/orders/{id}/payments")
    @Operation(summary = "monobank invoices of the order, newest first")
    public List<AdminInvoiceDto> list(@PathVariable String id) {
        return adminPayments.invoices(id);
    }

    @GetMapping("/orders/{id}/receipts")
    @Operation(summary = "Payment receipts of the order (fiscal checks + bank receipt) with signed download links")
    public List<ReceiptDto> receipts(@PathVariable String id) {
        return adminPayments.receipts(id);
    }

    @PostMapping("/orders/{id}/payments/refresh")
    @Operation(summary = "Ask monobank for the current state of the order's invoices")
    public List<AdminInvoiceDto> refresh(@PathVariable String id) {
        return adminPayments.refresh(id);
    }

    @PostMapping("/orders/{id}/payments/{invoiceId}/refund")
    @Operation(summary = "Refund a paid invoice to the card (all that is left, or amountMinor)")
    public List<AdminInvoiceDto> refund(@PathVariable String id, @PathVariable String invoiceId,
                                        @RequestBody(required = false) RefundRequest req) {
        return adminPayments.refund(id, invoiceId, req == null ? null : req.amountMinor());
    }

    @GetMapping("/payments/monobank/status")
    @Operation(summary = "Is monobank configured and reachable; the last webhook received")
    public AdminPayments.MonobankStatusDto status() {
        return adminPayments.monobankStatus();
    }
}
