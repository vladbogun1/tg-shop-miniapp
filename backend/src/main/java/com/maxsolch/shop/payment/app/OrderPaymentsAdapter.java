package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.order.app.OnlinePaymentDto;
import com.maxsolch.shop.order.app.OrderOnlinePayments;
import com.maxsolch.shop.payment.domain.MonobankGateway;
import com.maxsolch.shop.payment.domain.PaymentInvoice;
import com.maxsolch.shop.payment.infra.PaymentInvoiceRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;

/** Payment's side of {@link OrderOnlinePayments}: what the order module asks about and does to online payments. */
@Slf4j
@Component
public class OrderPaymentsAdapter implements OrderOnlinePayments {

    private final OnlinePaymentService payments;
    private final PaymentInvoiceRepository invoices;
    private final MonobankGateway monobank;
    private final Clock clock;

    public OrderPaymentsAdapter(OnlinePaymentService payments, PaymentInvoiceRepository invoices,
                                MonobankGateway monobank, Clock clock) {
        this.payments = payments;
        this.invoices = invoices;
        this.monobank = monobank;
        this.clock = clock;
    }

    @Override
    public OnlinePaymentDto summary(byte[] orderId, long amountDueMinor) {
        List<PaymentInvoice> list = invoices.findByOrderIdOrderByCreatedAtDesc(orderId);
        if (list.isEmpty()) {
            return new OnlinePaymentDto(monobank.isEnabled(), "none", null, null, 0, null, null, null);
        }
        // A paid invoice wins over a newer abandoned one (the card/method is what the customer wants to see) -
        // unless money is still due on a paid order (an item was added: a top-up), then the latest attempt
        // is what the customer is paying right now.
        PaymentInvoice inv = amountDueMinor > 0
                ? list.get(0)
                : list.stream().filter(i -> i.getAppliedAt() != null).findFirst().orElse(list.get(0));
        boolean live = inv.isPayable(clock.instant());
        return new OnlinePaymentDto(monobank.isEnabled(), inv.getStatus(), live ? inv.getPageUrl() : null,
                inv.getExpiresAt(), inv.getAmountMinor(), inv.getMaskedPan(), inv.getPaymentMethod(),
                inv.getFailureReason());
    }

    @Override
    public long refundableMinor(byte[] orderId) {
        return invoices.findByOrderIdOrderByCreatedAtDesc(orderId).stream()
                .filter(i -> i.getAppliedAt() != null)
                .mapToLong(i -> Math.max(0, i.getAmountMinor() - i.getRefundedMinor()))
                .sum();
    }

    @Override
    public boolean hasPaymentInFlight(byte[] orderId) {
        return payments.hasPaymentInFlight(orderId);
    }

    @Override
    public void refresh(byte[] orderId) {
        payments.refreshOrder(orderId);
    }

    @Override
    public void closeOpenInvoices(byte[] orderId) {
        payments.closeOpenInvoices(orderId);
    }

    @Override
    public RefundAll refundAll(byte[] orderId) {
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
        return new RefundAll(onlineReceived, requested, refunded, errors);
    }

    @Override
    public String refundableInvoice(byte[] orderId, long amountMinor) {
        return payments.refundableInvoice(orderId, amountMinor);
    }

    @Override
    public void refund(byte[] orderId, String invoiceId, Long amountMinor) {
        payments.refund(orderId, invoiceId, amountMinor);
    }
}
