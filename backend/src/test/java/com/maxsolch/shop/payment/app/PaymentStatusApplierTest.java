package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.order.domain.OrderFixtures;
import com.maxsolch.shop.journal.app.ActivityLog;
import com.maxsolch.shop.payment.domain.MonobankInvoiceStatus;
import com.maxsolch.shop.payment.domain.PaymentInvoice;
import com.maxsolch.shop.payment.infra.PaymentInvoiceRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.app.OrderPayments;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.mock;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/** The one place a monobank state changes our data: idempotent, ordered, amount-checked. */
@ExtendWith(MockitoExtension.class)
class PaymentStatusApplierTest {

    private static final String INVOICE = "p2_9ZgpZVsl3";
    private static final String T1 = "2026-10-05T10:00:00Z";
    private static final String T2 = "2026-10-05T10:00:05Z";
    private static final String T3 = "2026-10-05T10:00:09Z";

    @Mock
    PaymentInvoiceRepository invoices;
    @Mock
    OrderPayments orderPayments;

    PaymentStatusApplier applier;
    PaymentInvoice inv;

    @BeforeEach
    void setUp() {
        applier = new PaymentStatusApplier(invoices, orderPayments, mock(ActivityLog.class), java.time.Clock.systemUTC());
        inv = new PaymentInvoice();
        OrderFixtures.set(inv, "id", UuidUtil.randomBytes());
        OrderFixtures.set(inv, "orderId", UuidUtil.randomBytes());
        OrderFixtures.set(inv, "externalId", INVOICE);
        OrderFixtures.set(inv, "amountMinor", 4200);
        OrderFixtures.set(inv, "pageUrl", "https://pay.monobank.ua/" + INVOICE);
        OrderFixtures.set(inv, "expiresAt", Instant.parse(T1).plusSeconds(3600));
        lenient().when(invoices.findForUpdate(PaymentInvoice.PROVIDER_MONOBANK, INVOICE)).thenReturn(Optional.of(inv));
    }

    private static MonobankInvoiceStatus status(String status, Long amount, Long finalAmount, String modified) {
        return new MonobankInvoiceStatus(INVOICE, status, null, null, amount, 980, finalAmount,
                T1, modified, "order-ref", null, null);
    }

    private static MonobankInvoiceStatus success(String modified) {
        return status(PaymentInvoice.SUCCESS, 4200L, 4200L, modified);
    }

    @Test
    void success_creditsTheOrderExactlyOnce() {
        assertThat(applier.apply(success(T2))).isTrue();
        assertThat(applier.apply(success(T2))).isTrue(); // the same webhook delivered again

        verify(orderPayments, times(1)).recordOnlinePayment(eq(inv.getOrderId()), eq(4200L), any());
        assertThat(inv.getStatus()).isEqualTo(PaymentInvoice.SUCCESS);
        assertThat(inv.getAppliedAt()).isNotNull();
        assertThat(inv.getProviderModifiedAt()).isEqualTo(Instant.parse(T2));
        verify(orderPayments, never()).recordOnlineRefund(any(), anyLong(), any());
    }

    @Test
    void staleState_isIgnored() {
        applier.apply(success(T2));

        // the "processing" webhook sent before the success arrives late
        assertThat(applier.apply(status(PaymentInvoice.PROCESSING, 4200L, null, T1))).isTrue();

        assertThat(inv.getStatus()).isEqualTo(PaymentInvoice.SUCCESS);
        assertThat(inv.getProviderModifiedAt()).isEqualTo(Instant.parse(T2));
        verify(invoices, times(1)).save(inv);
    }

    @Test
    void staleSuccess_afterANewerFailure_isNotCredited() {
        applier.apply(status(PaymentInvoice.FAILURE, 4200L, null, T2));

        applier.apply(success(T1));

        verify(orderPayments, never()).recordOnlinePayment(any(), anyLong(), any());
        assertThat(inv.getStatus()).isEqualTo(PaymentInvoice.FAILURE);
    }

    @Test
    void laterProcessing_afterSuccess_doesNotDowngrade() {
        applier.apply(success(T2));

        applier.apply(status(PaymentInvoice.PROCESSING, 4200L, null, T3));

        assertThat(inv.getStatus()).isEqualTo(PaymentInvoice.SUCCESS);
        verify(orderPayments, times(1)).recordOnlinePayment(any(), anyLong(), any());
    }

    @Test
    void amountMismatch_isNotApplied() {
        assertThat(applier.apply(status(PaymentInvoice.SUCCESS, 1L, 1L, T2))).isTrue();

        verify(orderPayments, never()).recordOnlinePayment(any(), anyLong(), any());
        verify(invoices, never()).save(any());
        assertThat(inv.getStatus()).isEqualTo(PaymentInvoice.CREATED);
        assertThat(inv.getAppliedAt()).isNull();
    }

    @Test
    void currencyMismatch_isNotApplied() {
        applier.apply(new MonobankInvoiceStatus(INVOICE, PaymentInvoice.SUCCESS, null, null, 4200L, 840, 4200L,
                T1, T2, null, null, null));

        verify(orderPayments, never()).recordOnlinePayment(any(), anyLong(), any());
    }

    @Test
    void finalAmountBelowAmount_booksTheRefundDeltaOnce() {
        applier.apply(success(T1));

        // 30 UAH went back to the card (admin button or the monobank cabinet)
        applier.apply(status(PaymentInvoice.SUCCESS, 4200L, 1200L, T2));
        applier.apply(status(PaymentInvoice.SUCCESS, 4200L, 1200L, T2));
        verify(orderPayments, times(1)).recordOnlineRefund(eq(inv.getOrderId()), eq(3000L), any());
        assertThat(inv.getRefundedMinor()).isEqualTo(3000);

        // the rest follows: only the new part is booked
        applier.apply(status(PaymentInvoice.REVERSED, 4200L, 0L, T3));
        verify(orderPayments).recordOnlineRefund(eq(inv.getOrderId()), eq(1200L), any());
        assertThat(inv.getRefundedMinor()).isEqualTo(4200);
        verify(orderPayments, times(1)).recordOnlinePayment(any(), anyLong(), any());
    }

    @Test
    void refundOfAnUnpaidInvoice_isNotBooked() {
        applier.apply(status(PaymentInvoice.FAILURE, 4200L, 0L, T2));

        verify(orderPayments, never()).recordOnlineRefund(any(), anyLong(), any());
    }

    @Test
    void reversedFirstSeen_creditsThenBooksTheRefund() {
        // the success webhook was lost; the poll first sees the invoice already fully refunded
        applier.apply(new MonobankInvoiceStatus(INVOICE, PaymentInvoice.REVERSED, null, null, 4200L, 980, null,
                T1, T2, null, null, List.of(new MonobankInvoiceStatus.CancelItem("success", 4200L, 980, T2, T2, "r1"))));

        verify(orderPayments).recordOnlinePayment(eq(inv.getOrderId()), eq(4200L), any());
        verify(orderPayments).recordOnlineRefund(eq(inv.getOrderId()), eq(4200L), any());
    }

    @Test
    void unknownInvoice_returnsFalse() {
        assertThat(applier.apply(new MonobankInvoiceStatus("other", PaymentInvoice.SUCCESS, null, null, 4200L, 980,
                4200L, T1, T2, null, null, null))).isFalse();
        assertThat(applier.apply(null)).isFalse();

        verify(orderPayments, never()).recordOnlinePayment(any(), anyLong(), any());
    }
}
