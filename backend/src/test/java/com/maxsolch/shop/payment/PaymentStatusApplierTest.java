package com.maxsolch.shop.payment;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.service.OrderService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

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
    OrderService orderService;

    PaymentStatusApplier applier;
    PaymentInvoice inv;

    @BeforeEach
    void setUp() {
        applier = new PaymentStatusApplier(invoices, orderService);
        inv = new PaymentInvoice();
        inv.setId(UuidUtil.randomBytes());
        inv.setOrderId(UuidUtil.randomBytes());
        inv.setExternalId(INVOICE);
        inv.setAmountMinor(4200);
        inv.setPageUrl("https://pay.monobank.ua/" + INVOICE);
        inv.setExpiresAt(Instant.parse(T1).plusSeconds(3600));
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

        verify(orderService, times(1)).recordOnlinePayment(inv.getOrderId(), 4200);
        assertThat(inv.getStatus()).isEqualTo(PaymentInvoice.SUCCESS);
        assertThat(inv.getAppliedAt()).isNotNull();
        assertThat(inv.getProviderModifiedAt()).isEqualTo(Instant.parse(T2));
        verify(orderService, never()).recordOnlineRefund(any(), anyLong());
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

        verify(orderService, never()).recordOnlinePayment(any(), anyLong());
        assertThat(inv.getStatus()).isEqualTo(PaymentInvoice.FAILURE);
    }

    @Test
    void laterProcessing_afterSuccess_doesNotDowngrade() {
        applier.apply(success(T2));

        applier.apply(status(PaymentInvoice.PROCESSING, 4200L, null, T3));

        assertThat(inv.getStatus()).isEqualTo(PaymentInvoice.SUCCESS);
        verify(orderService, times(1)).recordOnlinePayment(any(), anyLong());
    }

    @Test
    void amountMismatch_isNotApplied() {
        assertThat(applier.apply(status(PaymentInvoice.SUCCESS, 1L, 1L, T2))).isTrue();

        verify(orderService, never()).recordOnlinePayment(any(), anyLong());
        verify(invoices, never()).save(any());
        assertThat(inv.getStatus()).isEqualTo(PaymentInvoice.CREATED);
        assertThat(inv.getAppliedAt()).isNull();
    }

    @Test
    void currencyMismatch_isNotApplied() {
        applier.apply(new MonobankInvoiceStatus(INVOICE, PaymentInvoice.SUCCESS, null, null, 4200L, 840, 4200L,
                T1, T2, null, null, null));

        verify(orderService, never()).recordOnlinePayment(any(), anyLong());
    }

    @Test
    void finalAmountBelowAmount_booksTheRefundDeltaOnce() {
        applier.apply(success(T1));

        // 30 UAH went back to the card (admin button or the monobank cabinet)
        applier.apply(status(PaymentInvoice.SUCCESS, 4200L, 1200L, T2));
        applier.apply(status(PaymentInvoice.SUCCESS, 4200L, 1200L, T2));
        verify(orderService, times(1)).recordOnlineRefund(inv.getOrderId(), 3000);
        assertThat(inv.getRefundedMinor()).isEqualTo(3000);

        // the rest follows: only the new part is booked
        applier.apply(status(PaymentInvoice.REVERSED, 4200L, 0L, T3));
        verify(orderService).recordOnlineRefund(inv.getOrderId(), 1200);
        assertThat(inv.getRefundedMinor()).isEqualTo(4200);
        verify(orderService, times(1)).recordOnlinePayment(any(), anyLong());
    }

    @Test
    void refundOfAnUnpaidInvoice_isNotBooked() {
        applier.apply(status(PaymentInvoice.FAILURE, 4200L, 0L, T2));

        verify(orderService, never()).recordOnlineRefund(any(), anyLong());
    }

    @Test
    void reversedFirstSeen_creditsThenBooksTheRefund() {
        // the success webhook was lost; the poll first sees the invoice already fully refunded
        applier.apply(new MonobankInvoiceStatus(INVOICE, PaymentInvoice.REVERSED, null, null, 4200L, 980, null,
                T1, T2, null, null, List.of(new MonobankInvoiceStatus.CancelItem("success", 4200L, 980, T2, T2, "r1"))));

        verify(orderService).recordOnlinePayment(inv.getOrderId(), 4200);
        verify(orderService).recordOnlineRefund(eq(inv.getOrderId()), eq(4200L));
    }

    @Test
    void unknownInvoice_returnsFalse() {
        assertThat(applier.apply(new MonobankInvoiceStatus("other", PaymentInvoice.SUCCESS, null, null, 4200L, 980,
                4200L, T1, T2, null, null, null))).isFalse();
        assertThat(applier.apply(null)).isFalse();

        verify(orderService, never()).recordOnlinePayment(any(), anyLong());
    }
}
