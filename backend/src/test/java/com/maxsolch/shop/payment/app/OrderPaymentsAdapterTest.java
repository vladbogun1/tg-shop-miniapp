package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.order.app.OnlinePaymentDto;
import com.maxsolch.shop.order.app.OrderOnlinePayments;
import com.maxsolch.shop.payment.domain.MonobankGateway;
import com.maxsolch.shop.payment.domain.PaymentInvoice;
import com.maxsolch.shop.payment.infra.PaymentInvoiceRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** What the order module gets from payments: the full refund loop of an approved cancellation and the order card's summary. */
class OrderPaymentsAdapterTest {

    private static final Instant NOW = Instant.parse("2026-10-30T10:00:00Z");

    private final byte[] orderId = UuidUtil.randomBytes();
    private OnlinePaymentService payments;
    private PaymentInvoiceRepository invoices;
    private MonobankGateway monobank;
    private OrderPaymentsAdapter adapter;

    @BeforeEach
    void setUp() {
        payments = mock(OnlinePaymentService.class);
        invoices = mock(PaymentInvoiceRepository.class);
        monobank = mock(MonobankGateway.class);
        adapter = new OrderPaymentsAdapter(payments, invoices, monobank, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static PaymentInvoice paid(String id, long amount, long refunded) {
        PaymentInvoice i = new PaymentInvoice();
        i.setExternalId(id);
        i.setAmountMinor(amount);
        i.setRefundedMinor(refunded);
        i.setStatus(PaymentInvoice.SUCCESS);
        i.setAppliedAt(NOW);
        return i;
    }

    @Test
    void refundAll_refundsEveryPaidInvoiceInFull_andSkipsTheUnpaidOne() {
        PaymentInvoice failed = new PaymentInvoice();
        failed.setExternalId("inv-failed");
        failed.setStatus(PaymentInvoice.FAILURE);
        when(invoices.findByOrderIdOrderByCreatedAtDesc(orderId))
                .thenReturn(List.of(paid("inv-1", 10_000, 0), failed, paid("inv-2", 90_000, 0)));

        OrderOnlinePayments.RefundAll r = adapter.refundAll(orderId);

        var order = inOrder(payments);
        order.verify(payments).refund(eq(orderId), eq("inv-1"), isNull());
        order.verify(payments).refund(eq(orderId), eq("inv-2"), isNull());
        verify(payments, never()).refund(any(), eq("inv-failed"), any());
        assertThat(r).isEqualTo(new OrderOnlinePayments.RefundAll(100_000, 100_000, 2, List.of()));
    }

    @Test
    void refundAll_reportsARefusedRefundAndKeepsGoing() {
        when(invoices.findByOrderIdOrderByCreatedAtDesc(orderId))
                .thenReturn(List.of(paid("inv-1", 10_000, 0), paid("inv-2", 20_000, 0)));
        doThrow(new DomainException.BadRequest("monobank отклонил возврат")).when(payments).refund(orderId, "inv-1", null);

        OrderOnlinePayments.RefundAll r = adapter.refundAll(orderId);

        assertThat(r.onlineReceivedMinor()).isEqualTo(30_000);
        assertThat(r.requestedMinor()).isEqualTo(20_000);
        assertThat(r.refundedInvoices()).isEqualTo(1);
        assertThat(r.errors()).hasSize(1);
        assertThat(r.errors().get(0)).startsWith("inv-1: ");
    }

    @Test
    void refundAll_skipsWhatIsFullyReturnedOrAlreadyBeingReturned() {
        PaymentInvoice pending = paid("inv-pending", 5_000, 0);
        pending.setRefundPendingUntil(NOW.plusSeconds(60));
        when(invoices.findByOrderIdOrderByCreatedAtDesc(orderId))
                .thenReturn(List.of(paid("inv-done", 5_000, 5_000), pending));

        OrderOnlinePayments.RefundAll r = adapter.refundAll(orderId);

        verify(payments, never()).refund(any(), any(), any());
        assertThat(r.requestedMinor()).isZero();
        assertThat(r.onlineReceivedMinor()).isEqualTo(10_000);
    }

    @Test
    void refundableMinor_isWhatIsLeftOnPaidInvoices() {
        when(invoices.findByOrderIdOrderByCreatedAtDesc(orderId))
                .thenReturn(List.of(paid("a", 10_000, 4_000), paid("b", 5_000, 5_000), new PaymentInvoice()));

        assertThat(adapter.refundableMinor(orderId)).isEqualTo(6_000);
    }

    @Test
    void summary_withoutInvoicesIsNone() {
        when(monobank.isEnabled()).thenReturn(true);
        when(invoices.findByOrderIdOrderByCreatedAtDesc(orderId)).thenReturn(List.of());

        OnlinePaymentDto dto = adapter.summary(orderId, 0);

        assertThat(dto.enabled()).isTrue();
        assertThat(dto.status()).isEqualTo("none");
    }

    @Test
    void summary_paidInvoiceWinsOverNewerAbandonedOne_unlessMoneyIsStillDue() {
        PaymentInvoice abandoned = new PaymentInvoice();
        abandoned.setStatus(PaymentInvoice.EXPIRED);
        PaymentInvoice paid = paid("p", 10_000, 0);
        when(invoices.findByOrderIdOrderByCreatedAtDesc(orderId)).thenReturn(List.of(abandoned, paid));

        assertThat(adapter.summary(orderId, 0).status()).isEqualTo(PaymentInvoice.SUCCESS);
        assertThat(adapter.summary(orderId, 500).status()).isEqualTo(PaymentInvoice.EXPIRED);
    }
}
